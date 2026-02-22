import { PoseDetection } from './poseDetection.js';
import { GameEngine } from './gameEngine.js';
import { RenderingSystem } from './renderingSystem.js';
import { ParticleSystem } from './particleSystem.js';
import { AudioSystem } from './audioSystem.js';

// DOM elements
const startScreen     = document.getElementById('start-screen');
const gameoverScreen  = document.getElementById('gameover-screen');
const pauseScreen     = document.getElementById('pause-screen');
const startBtn        = document.getElementById('start-btn');
const restartBtn      = document.getElementById('restart-btn');
const resumeBtn       = document.getElementById('resume-btn');
const pauseBtn        = document.getElementById('pause-btn');
const scoreValue      = document.getElementById('score-value');
const comboDisplay    = document.getElementById('combo-display');
const comboValueEl    = document.getElementById('combo-value');
const fpsDisplay      = document.getElementById('fps-display');
const finalScoreValue = document.getElementById('final-score-value');
const finalComboValue = document.getElementById('final-combo-value');
const timerValue      = document.getElementById('timer-value');
const timePenalty     = document.getElementById('time-penalty');
const gameCanvas      = document.getElementById('game-canvas');
const poseCanvas      = document.getElementById('pose-canvas');
const webcamEl        = document.getElementById('webcam');

// Systems
const poseDetection   = new PoseDetection();
const gameEngine      = new GameEngine();
const renderingSystem = new RenderingSystem(gameCanvas, poseCanvas);
const particleSystem  = new ParticleSystem(renderingSystem.poseCtx);
particleSystem.setGameContext(renderingSystem.gameCtx);
const audio           = new AudioSystem();

// State
let running = false;
let lastTime = 0;
let fpsCounter = 0;
let fpsTime = 0;
let comboHideTimer = 0;
let cameraReady = false;
let penaltyTimer = null;
let lastSwingTime = 0;
let soundsLoaded = false;

// --- Show floating +/- time text ---
function showTimePenalty(text, type) {
  if (penaltyTimer) clearTimeout(penaltyTimer);
  timePenalty.textContent = text;
  timePenalty.className = type === 'bonus' ? 'show-bonus' : 'show-penalty';
  penaltyTimer = setTimeout(() => {
    timePenalty.className = '';
  }, 1000);
}

// --- Game engine callbacks ---

gameEngine.onSlice = (obj, hand, combo, pieces) => {
  const sx = obj.x * renderingSystem.width;
  const sy = obj.y * renderingSystem.height;
  const color = renderingSystem.getFruitColor(obj.type);
  particleSystem.emitSlice(sx, sy, color, hand.vx, hand.vy);

  // Juice splatter on screen
  particleSystem.emitSplatter(sx, sy, color, hand.vx, hand.vy);

  if (obj.generation > 0) {
    particleSystem.emit(sx, sy, color, 8);
    // Smaller splatter for pieces
    particleSystem.emitSplatter(sx, sy, color, hand.vx, hand.vy);
  }

  if (combo >= 3) {
    audio.playCombo();
  } else {
    audio.playClash();
  }
};

gameEngine.onBomb = (obj) => {
  const sx = obj.x * renderingSystem.width;
  const sy = obj.y * renderingSystem.height;

  // Massive explosion particles
  particleSystem.emitBombExplosion(sx, sy, renderingSystem.width, renderingSystem.height);

  // White → red flash
  renderingSystem.triggerFlash('#ff5555', 0.85);
  // Second white flash slightly delayed for dramatic effect
  setTimeout(() => {
    renderingSystem.triggerFlash('white', 0.5);
  }, 80);

  // Screen shake via CSS
  document.body.classList.add('screen-shake');
  setTimeout(() => {
    document.body.classList.remove('screen-shake');
  }, 500);

  audio.playBomb();
  showTimePenalty('💣 −10s', 'penalty');
};

gameEngine.onHeart = (obj) => {
  const sx = obj.x * renderingSystem.width;
  const sy = obj.y * renderingSystem.height;
  particleSystem.emitSlice(sx, sy, '#ff79c6', 0, -1);
  particleSystem.emit(sx, sy, '#ff79c6', 15);
  audio.playHeart();
  showTimePenalty('❤️ +10s', 'bonus');
};

gameEngine.onScore = (score, combo) => {
  scoreValue.textContent = score;
  scoreValue.classList.add('bump');
  setTimeout(() => scoreValue.classList.remove('bump'), 100);

  if (combo >= 2) {
    comboValueEl.textContent = `x${combo} COMBO! 🔥`;
    comboDisplay.classList.remove('hidden');
    comboHideTimer = 1.5;
  }
};

gameEngine.onTimeChange = (time) => {
  const display = Math.ceil(Math.max(0, time));
  timerValue.textContent = display;

  timerValue.classList.remove('warning', 'critical');
  if (time <= 5) {
    timerValue.classList.add('critical');
  } else if (time <= 10) {
    timerValue.classList.add('warning');
  }

  // Red border danger intensity: ramps from 0 at 10s to 1 at 0s
  if (time <= 10) {
    renderingSystem.setDangerIntensity(1 - time / 10);
  } else {
    renderingSystem.setDangerIntensity(0);
  }
};

gameEngine.onMiss = (_obj) => {};

// --- Main game loop ---

function gameLoop(timestamp) {
  if (!running) return;
  requestAnimationFrame(gameLoop);

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  // FPS
  fpsCounter++;
  fpsTime += dt;
  if (fpsTime >= 1) {
    fpsDisplay.textContent = `FPS: ${fpsCounter}`;
    fpsCounter = 0;
    fpsTime = 0;
  }

  // Pose detection
  poseDetection.detect(timestamp);
  const hands = poseDetection.getHands();
  const landmarks = poseDetection.getPoseLandmarks();
  const connections = poseDetection.getConnections();
  const handLandmarks = poseDetection.getHandLandmarks();
  const handOpen = poseDetection.getHandOpen();
  const prevHandOpen = poseDetection.getPrevHandOpen();

  // --- Ignition / retract detection ---
  for (const side of ['left', 'right']) {
    if (hands[side].visible) {
      if (handOpen[side] && !prevHandOpen[side]) {
        // Hand just opened → ignite
        audio.ignite();
      } else if (!handOpen[side] && prevHandOpen[side]) {
        // Hand just closed → retract
        audio.retract();
      }
    }
  }

  // --- Lightsaber hum + swing ---
  const anyOpen = (hands.left.visible && handOpen.left) || (hands.right.visible && handOpen.right);
  const maxSpeed = Math.max(
    (hands.left.visible && handOpen.left) ? hands.left.speed : 0,
    (hands.right.visible && handOpen.right) ? hands.right.speed : 0
  );
  audio.updateSaber(maxSpeed, anyOpen);

  // Swing sound on fast movement
  if (maxSpeed > 1.5 && anyOpen) {
    audio.playSaberSwing();
  }

  // Update game logic — only detect collisions when at least one hand is open
  // (temporarily disable hands that are fists)
  const effectiveHands = {
    left: { ...hands.left, visible: hands.left.visible && handOpen.left },
    right: { ...hands.right, visible: hands.right.visible && handOpen.right },
  };
  gameEngine.update(dt, effectiveHands);

  // Combo display timer
  if (comboHideTimer > 0) {
    comboHideTimer -= dt;
    if (comboHideTimer <= 0) {
      comboDisplay.classList.add('hidden');
    }
  }

  // --- RENDER ---
  renderingSystem._lastDt = dt;
  renderingSystem.drawGameObjects(gameEngine.getActiveObjects(), particleSystem);

  renderingSystem.clearPoseCanvas();
  renderingSystem.drawSkeleton(landmarks, connections);
  renderingSystem.drawHandTrails(hands, handLandmarks, handOpen);
  particleSystem.update(dt);

  // Game over check
  if (gameEngine.isGameOver) {
    showGameOver();
  }
}

// --- UI ---

async function startGame() {
  startScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');

  audio.init();

  if (!cameraReady) {
    startBtn.textContent = '📷 STARTING CAMERA...';
    startBtn.disabled = true;
    try {
      await poseDetection.startCamera(webcamEl);
      startBtn.textContent = '🧠 LOADING AI MODELS...';
      await poseDetection.init();
      cameraReady = true;
    } catch (err) {
      console.error('Failed to init:', err);
      startBtn.textContent = '❌ ERROR - CHECK WEBCAM & REFRESH';
      startBtn.disabled = false;
      startScreen.classList.remove('hidden');
      return;
    }
  }

  // Load sounds if not loaded yet
  if (!soundsLoaded) {
    startBtn.textContent = '🔊 LOADING SOUNDS...';
    await audio.loadSounds();
    soundsLoaded = true;
  }

  pauseBtn.classList.remove('hidden');

  // Reset
  gameEngine.reset();
  renderingSystem.clearAllMeshes();
  particleSystem.clear();
  scoreValue.textContent = '0';
  timerValue.textContent = '30';
  timerValue.classList.remove('warning', 'critical');
  comboDisplay.classList.add('hidden');

  running = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function showGameOver() {
  running = false;
  pauseBtn.classList.add('hidden');
  finalScoreValue.textContent = gameEngine.score;
  finalComboValue.textContent = gameEngine.bestCombo;
  setTimeout(() => {
    gameoverScreen.classList.remove('hidden');
  }, 600);
}

function togglePause() {
  if (gameEngine.isGameOver) return;

  if (gameEngine.isPaused) {
    gameEngine.isPaused = false;
    pauseScreen.classList.add('hidden');
    pauseBtn.textContent = '⏸';
    lastTime = performance.now();
    running = true;
    requestAnimationFrame(gameLoop);
  } else {
    gameEngine.isPaused = true;
    running = false;
    pauseScreen.classList.remove('hidden');
    pauseBtn.textContent = '▶';
  }
}

// Event listeners
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
resumeBtn.addEventListener('click', togglePause);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (!startScreen.classList.contains('hidden') || !gameoverScreen.classList.contains('hidden')) return;
    togglePause();
  }
});

console.log('[VisionSlice] Ready — click START to begin');
