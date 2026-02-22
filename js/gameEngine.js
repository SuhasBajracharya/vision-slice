import { ObjectPool } from './objectPool.js';
import { CollisionSystem } from './collisionSystem.js';

const FRUIT_TYPES = ['apple', 'orange', 'lemon', 'lime', 'grape', 'watermelon'];

let nextId = 0;
function generateId() {
  return ++nextId;
}

export class GameEngine {
  constructor() {
    this.collisionSystem = new CollisionSystem();

    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.comboWindow = 1.0;
    this.isGameOver = false;
    this.isPaused = false;
    this.elapsed = 0;

    // Timer
    this.timeRemaining = 30; // 30 second countdown
    this.maxTime = 60;       // cap at 60s

    this.spawnInterval = 1.5;
    this.spawnTimer = 0;
    this.minSpawnInterval = 0.4;
    this.bombChance = 0.12;
    this.maxBombChance = 0.25;
    this.heartChance = 0.06;   // 6% chance for heart
    this.difficultyRate = 0.003;
    this.gravity = 0.4;

    // Use a simple array instead of pool for flexibility (pieces get created dynamically)
    this.objects = [];

    this.onSlice = null;
    this.onBomb = null;
    this.onHeart = null;
    this.onScore = null;
    this.onMiss = null;
    this.onTimeChange = null;
    this.onSpawn = null;
    this.onRemove = null;
  }

  reset() {
    this.score = 0; this.combo = 0; this.bestCombo = 0;
    this.comboTimer = 0; this.isGameOver = false;
    this.isPaused = false; this.elapsed = 0;
    this.timeRemaining = 30;
    this.spawnInterval = 1.5; this.spawnTimer = 0;
    this.bombChance = 0.12; nextId = 0;
    this.objects = [];
  }

  /**
   * Spawn a fruit, bomb, or heart — falls from the top.
   */
  _spawnObject() {
    const roll = Math.random();
    let type, isBomb = false, isHeart = false;

    if (roll < this.bombChance) {
      isBomb = true;
      type = 'bomb';
    } else if (roll < this.bombChance + this.heartChance) {
      isHeart = true;
      type = 'heart';
    } else {
      type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
    }

    const obj = {
      id: generateId(),
      type,
      isBomb,
      isHeart,
      x: 0.08 + Math.random() * 0.84,
      y: -0.08,                              // above screen
      vx: (Math.random() - 0.5) * 0.12,
      vy: 0.08 + Math.random() * 0.1,        // falling down
      radius: isBomb ? 0.035 : isHeart ? 0.03 : (0.028 + Math.random() * 0.014),
      rotationSpeed: (Math.random() - 0.5) * 0.08,
      rotation: 0,
      active: true,
      sliceCount: 0,
      maxSlices: 3,
      fadeTimer: 0,
      fading: false,
      generation: 0,
      halfSide: undefined,
      emoji: null,
    };

    this.objects.push(obj);
    if (this.onSpawn) this.onSpawn(obj);
    return obj;
  }

  /**
   * Split a fruit into two halves that fly apart.
   */
  _splitFruit(obj, hand) {
    if (obj.generation >= 2) {
      obj.fading = true;
      obj.fadeTimer = 0;
      return [];
    }

    const newGen = obj.generation + 1;
    const newRadius = obj.radius * 0.7;
    const pieces = [];

    let perpX, perpY;
    const handSpeed = Math.sqrt(hand.vx * hand.vx + hand.vy * hand.vy);
    if (handSpeed > 0.01) {
      perpX = -hand.vy / handSpeed;
      perpY = hand.vx / handSpeed;
    } else {
      perpX = 1;
      perpY = 0;
    }

    const spreadSpeed = 0.15 + handSpeed * 0.1;

    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1;
      const piece = {
        id: generateId(),
        type: obj.type,
        isBomb: false,
        isHeart: false,
        x: obj.x + perpX * sign * 0.01,
        y: obj.y + perpY * sign * 0.01,
        vx: obj.vx + perpX * sign * spreadSpeed + hand.vx * 0.05,
        vy: obj.vy + perpY * sign * spreadSpeed + hand.vy * 0.05 - 0.05,
        radius: newRadius,
        rotationSpeed: (Math.random() - 0.5) * 0.15,
        rotation: obj.rotation,
        active: true,
        sliceCount: 0,
        maxSlices: 3 - newGen,
        fadeTimer: 0,
        fading: false,
        generation: newGen,
        halfSide: i,
        emoji: null,
      };
      pieces.push(piece);
      this.objects.push(piece);
      if (this.onSpawn) this.onSpawn(piece);
    }

    return pieces;
  }

  update(dt, hands) {
    if (this.isGameOver || this.isPaused) return { spawned: [], removed: [], hits: [] };

    this.elapsed += dt;
    const frameInfo = { spawned: [], removed: [], hits: [] };

    // Countdown timer
    this.timeRemaining -= dt;
    if (this.onTimeChange) this.onTimeChange(this.timeRemaining);
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.isGameOver = true;
      return frameInfo;
    }

    // Difficulty ramp
    this.spawnInterval = Math.max(this.minSpawnInterval, 1.5 - this.elapsed * this.difficultyRate);
    this.bombChance = Math.min(this.maxBombChance, 0.12 + this.elapsed * 0.001);

    // Spawning — fall from top
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      const count = 1 + Math.floor(Math.random() * Math.min(3, 1 + this.elapsed / 20));
      for (let i = 0; i < count; i++) {
        const obj = this._spawnObject();
        obj.x = 0.08 + (i / count) * 0.84 + (Math.random() - 0.5) * 0.1;
        frameInfo.spawned.push(obj);
      }
    }

    // Combo decay
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Physics
    const toRemove = [];
    for (const obj of this.objects) {
      if (!obj.active) continue;

      if (obj.fading) {
        obj.fadeTimer += dt;
        obj.vy += this.gravity * dt;
        obj.x += obj.vx * dt;
        obj.y += obj.vy * dt;
        obj.rotation += obj.rotationSpeed;
        if (obj.fadeTimer > 0.6) {
          toRemove.push(obj);
        }
        continue;
      }

      obj.vy += this.gravity * dt;
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.rotation += obj.rotationSpeed;

      if (obj.y > 1.2) {
        toRemove.push(obj);
      }
      if (obj.x < -0.15 || obj.x > 1.15) {
        toRemove.push(obj);
      }
    }

    // Collision
    const sliceable = this.objects.filter(o => o.active && !o.fading);
    const hits = this.collisionSystem.checkAll(hands, sliceable);

    for (const hit of hits) {
      const obj = hit.object;

      if (obj.isBomb) {
        // Bomb: -10 seconds, don't end game
        this.timeRemaining = Math.max(0, this.timeRemaining - 10);
        obj.fading = true;
        obj.fadeTimer = 0;

        // Clear EVERYTHING on screen
        for (const other of this.objects) {
          if (other !== obj && other.active && !other.fading) {
            other.fading = true;
            other.fadeTimer = 0.4; // fast fade
          }
        }

        if (this.onBomb) this.onBomb(obj);
        if (this.onTimeChange) this.onTimeChange(this.timeRemaining);
        frameInfo.hits.push(hit);
        if (this.timeRemaining <= 0) {
          this.isGameOver = true;
          break;
        }
        continue;
      }

      if (obj.isHeart) {
        // Heart: +10 seconds
        this.timeRemaining = Math.min(this.maxTime, this.timeRemaining + 10);
        obj.fading = true;
        obj.fadeTimer = 0;
        if (this.onHeart) this.onHeart(obj);
        if (this.onTimeChange) this.onTimeChange(this.timeRemaining);
        frameInfo.hits.push(hit);
        continue;
      }

      // Slice fruit
      const pieces = this._splitFruit(obj, hit.hand);
      frameInfo.spawned.push(...pieces);

      obj.fading = true;
      obj.fadeTimer = 0;

      this.combo++;
      this.comboTimer = this.comboWindow;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;

      const genBonus = (obj.generation + 1);
      const points = 10 * genBonus * Math.max(1, this.combo);
      this.score += points;

      if (this.onSlice) this.onSlice(obj, hit.hand, this.combo, pieces);
      if (this.onScore) this.onScore(this.score, this.combo);
      frameInfo.hits.push(hit);
    }

    // Cleanup
    for (const obj of toRemove) {
      obj.active = false;
      const idx = this.objects.indexOf(obj);
      if (idx !== -1) this.objects.splice(idx, 1);
      if (this.onRemove) this.onRemove(obj);
      frameInfo.removed.push(obj);
    }

    return frameInfo;
  }

  getActiveObjects() {
    return this.objects.filter(o => o.active);
  }
}
