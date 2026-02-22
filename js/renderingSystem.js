/**
 * 2D Canvas rendering system using emojis for fruits/bombs.
 * No more Three.js blobs — everything is drawn on canvas.
 */
export class RenderingSystem {
  constructor(gameCanvas, poseCanvas) {
    this.gameCanvas = gameCanvas;
    this.poseCanvas = poseCanvas;
    this.gameCtx = gameCanvas.getContext('2d');
    this.poseCtx = poseCanvas.getContext('2d');

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this._resize();

    // Fruit emoji map
    this.fruitEmojis = {
      apple: '🍎',
      orange: '🍊',
      lemon: '🍋',
      lime: '🍈',
      grape: '🍇',
      watermelon: '🍉',
    };

    this.bombEmoji = '💣';
    this.heartEmoji = '❤️';

    // Particle/splatter colors — juice-accurate
    this.fruitColorCSS = {
      apple: '#e8333a',
      orange: '#ff8c1a',
      lemon: '#ffe033',
      lime: '#6dcc3a',
      grape: '#9b4dca',
      watermelon: '#ff4d6a',
      bomb: '#ff5555',
      heart: '#ff79c6',
    };

    // Slice trail
    this.trailPoints = { left: [], right: [] };
    this.maxTrailLength = 12;

    // Object rotation tracker
    this.rotations = new Map();

    // Screen flash state
    this.flashAlpha = 0;
    this.flashColor = 'white';

    // Danger vignette state
    this.dangerIntensity = 0; // 0 = safe, 1 = about to die

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.gameCanvas.width = this.width;
    this.gameCanvas.height = this.height;
    this.poseCanvas.width = this.width;
    this.poseCanvas.height = this.height;
  }

  /**
   * Called when a new object is spawned — just track rotation.
   */
  createFruitMesh(obj) {
    this.rotations.set(obj.id, 0);
  }

  createBombMesh(obj) {
    this.rotations.set(obj.id, 0);
  }

  /**
   * Update rotation tracking.
   */
  updateObjectMesh(obj) {
    let rot = this.rotations.get(obj.id) || 0;
    rot += obj.rotationSpeed || 0.02;
    this.rotations.set(obj.id, rot);
  }

  /**
   * Remove rotation tracker.
   */
  removeMesh(id) {
    this.rotations.delete(id);
  }

  /**
   * Trigger a screen flash effect.
   * @param {string} color - CSS color
   * @param {number} intensity - starting alpha (0-1)
   */
  triggerFlash(color = 'white', intensity = 0.9) {
    this.flashAlpha = intensity;
    this.flashColor = color;
  }

  /**
   * Set danger intensity based on remaining time.
   * @param {number} intensity - 0 (safe) to 1 (critical)
   */
  setDangerIntensity(intensity) {
    this.dangerIntensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Draw all active game objects on the game canvas.
   * @param {Array} activeObjects
   */
  drawGameObjects(activeObjects, particleSystem) {
    const ctx = this.gameCtx;

    ctx.fillStyle = '#1e1f29';
    ctx.fillRect(0, 0, this.width, this.height);
    this._drawBackground(ctx);

    // Draw splatters behind everything
    if (particleSystem) {
      particleSystem.drawSplatters(this._lastDt || 0.016);
    }

    for (const obj of activeObjects) {
      if (!obj.active) continue;

      const sx = obj.x * this.width;
      const sy = obj.y * this.height;
      const size = obj.radius * this.width * 2.8;
      const rotation = obj.rotation || 0;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rotation);

      if (obj.fading) {
        const fade = Math.max(0, 1 - obj.fadeTimer / 0.6);
        ctx.globalAlpha = fade;
        ctx.scale(fade * 0.8 + 0.2, fade * 0.8 + 0.2);
      }

      let emoji;
      if (obj.isBomb) {
        emoji = this.bombEmoji;
      } else if (obj.isHeart) {
        emoji = this.heartEmoji;
      } else {
        emoji = this.fruitEmojis[obj.type] || '🍎';
      }

      if (obj.isBomb) {
        ctx.shadowColor = '#ff5555';
      } else if (obj.isHeart) {
        ctx.shadowColor = '#ff79c6';
      } else {
        ctx.shadowColor = this.fruitColorCSS[obj.type] || '#8be9fd';
      }
      ctx.shadowBlur = 12;

      if (obj.generation > 0 && obj.halfSide !== undefined) {
        ctx.save();
        ctx.beginPath();
        if (obj.halfSide === 0) {
          ctx.rect(-size, -size, size, size * 2);
        } else {
          ctx.rect(0, -size, size, size * 2);
        }
        ctx.clip();

        ctx.font = `${size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 0, 0);
        ctx.restore();

        const innerColor = this.fruitColorCSS[obj.type] || '#ff79c6';
        ctx.fillStyle = innerColor;
        ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.6;
        ctx.beginPath();
        const cutX = obj.halfSide === 0 ? size * 0.05 : -size * 0.05;
        ctx.ellipse(cutX, 0, size * 0.08, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.font = `${size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 0, 0);

        if (obj.isHeart) {
          ctx.shadowBlur = 20 + Math.sin(Date.now() * 0.008) * 10;
          ctx.fillText(emoji, 0, 0);
        }
      }

      ctx.restore();
    }

    // --- Screen flash overlay ---
    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
      // Decay flash
      this.flashAlpha *= 0.88;
      if (this.flashAlpha < 0.01) this.flashAlpha = 0;
    }

    // --- Danger red border vignette ---
    if (this.dangerIntensity > 0) {
      // Slow, smooth pulse — not flickery
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.003);
      const alpha = this.dangerIntensity * 0.25 * pulse;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ff1e1e';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  _drawBackground(ctx) {
    // Subtle radial vignette
    const grd = ctx.createRadialGradient(
      this.width / 2, this.height / 2, this.height * 0.2,
      this.width / 2, this.height / 2, this.height * 0.8
    );
    grd.addColorStop(0, 'rgba(40, 42, 54, 0)');
    grd.addColorStop(1, 'rgba(10, 10, 15, 0.4)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Draw stickman skeleton on the 2D overlay canvas.
   * Only draws body — NO hands/wrists (blade handles that).
   */
  drawSkeleton(landmarks, connections) {
    if (!landmarks) return;
    const ctx = this.poseCtx;
    const w = this.width;
    const h = this.height;

    // Only draw these connections (skip arm-to-wrist: [13,15] and [14,16])
    const bodyConnections = [
      [11, 12], // shoulders
      [11, 13], // left upper arm
      [12, 14], // right upper arm
      [11, 23], [12, 24], [23, 24], // torso
      [23, 25], [25, 27], // left leg
      [24, 26], [26, 28], // right leg
    ];

    ctx.strokeStyle = 'rgba(189, 147, 249, 0.7)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#bd93f9';
    ctx.shadowBlur = 10;
    ctx.lineCap = 'round';

    for (const [i, j] of bodyConnections) {
      const a = landmarks[i];
      const b = landmarks[j];
      if (!a || !b) continue;
      if ((a.visibility !== undefined && a.visibility < 0.4)) continue;
      if ((b.visibility !== undefined && b.visibility < 0.4)) continue;

      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    }

    // Draw body joints only (11-14 shoulders/elbows, 23-28 hips/knees/ankles)
    // Skip 15,16 (wrists) — blade handles those
    const bodyJoints = [11, 12, 13, 14, 23, 24, 25, 26, 27, 28];
    ctx.shadowBlur = 12;
    for (const i of bodyJoints) {
      const lm = landmarks[i];
      if (!lm || (lm.visibility !== undefined && lm.visibility < 0.4)) continue;

      ctx.fillStyle = '#ff79c6';
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw head
    const nose = landmarks[0];
    if (nose && (nose.visibility === undefined || nose.visibility > 0.4)) {
      ctx.fillStyle = '#8be9fd';
      ctx.beginPath();
      ctx.arc(nose.x * w, nose.y * h, 15, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  /**
   * Draw hand trails + blade for each hand.
   * @param {Object} hands - hand position/velocity data
   * @param {Object} handLandmarks - raw landmarks per hand
   * @param {Object} handOpen - { left: bool, right: bool }
   */
  drawHandTrails(hands, handLandmarks, handOpen) {
    const ctx = this.poseCtx;
    const w = this.width;
    const h = this.height;

    for (const side of ['left', 'right']) {
      const hand = hands[side];
      const trail = this.trailPoints[side];
      const lm = handLandmarks ? handLandmarks[side] : null;
      const isOpen = handOpen ? handOpen[side] : true;

      if (hand.visible && hand.speed > 0.3 && isOpen) {
        trail.push({ x: hand.x * w, y: hand.y * h });
        if (trail.length > this.maxTrailLength) trail.shift();
      } else {
        if (trail.length > 0) trail.shift();
      }

      // Slash trail — only when blade is active
      if (trail.length >= 2 && isOpen) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < trail.length; i++) {
          const alpha = i / trail.length;
          ctx.strokeStyle = side === 'left'
            ? `rgba(139, 233, 253, ${alpha})`
            : `rgba(255, 121, 198, ${alpha})`;
          ctx.lineWidth = alpha * 10;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw blade only when hand is open
      if (hand.visible && lm && lm.length >= 21 && isOpen) {
        this._drawBlade(ctx, lm, side, w, h, hand.speed);
      } else if (hand.visible && lm && lm.length >= 21 && !isOpen) {
        // Fist — draw a small fist indicator
        this._drawFist(ctx, lm, side, w, h);
      }
    }
  }

  /**
   * Draw a small fist indicator (no blade).
   */
  _drawFist(ctx, lm, side, w, h) {
    const wrist = { x: lm[0].x * w, y: lm[0].y * h };
    const midMcp = { x: lm[9].x * w, y: lm[9].y * h };
    const cx = (wrist.x + midMcp.x) / 2;
    const cy = (wrist.y + midMcp.y) / 2;

    const baseColor = side === 'left' ? [139, 233, 253] : [255, 121, 198];

    ctx.save();
    ctx.fillStyle = `rgba(${baseColor.join(',')}, 0.3)`;
    ctx.shadowColor = `rgb(${baseColor.join(',')})`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();

    // Fist emoji
    ctx.shadowBlur = 0;
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✊', cx, cy);
    ctx.restore();
  }

  /**
   * Draw a large katana blade shape covering the entire hand.
   * The hand IS the blade — wrist is the handle, fingertips are the edge.
   */
  _drawBlade(ctx, lm, side, w, h, speed) {
    // Key landmark positions in screen coords
    const wrist    = { x: lm[0].x * w,  y: lm[0].y * h };
    const thumbCmc = { x: lm[2].x * w,  y: lm[2].y * h };
    const thumbTip = { x: lm[4].x * w,  y: lm[4].y * h };
    const indexMcp = { x: lm[5].x * w,  y: lm[5].y * h };
    const indexTip = { x: lm[8].x * w,  y: lm[8].y * h };
    const midTip   = { x: lm[12].x * w, y: lm[12].y * h };
    const ringTip  = { x: lm[16].x * w, y: lm[16].y * h };
    const pinkyMcp = { x: lm[17].x * w, y: lm[17].y * h };
    const pinkyTip = { x: lm[20].x * w, y: lm[20].y * h };

    // Blade direction: wrist → middle fingertip
    const dirX = midTip.x - wrist.x;
    const dirY = midTip.y - wrist.y;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 5) return; // hand too small/collapsed

    // Extend blade tip well beyond fingertips
    const extendFactor = 0.6;
    const tipX = midTip.x + dirX * extendFactor;
    const tipY = midTip.y + dirY * extendFactor;

    // Perpendicular direction for blade width
    const perpX = -dirY / len;
    const perpY = dirX / len;

    // Blade width at base (near wrist) — about palm width
    const baseWidth = Math.sqrt(
      (indexMcp.x - pinkyMcp.x) ** 2 + (indexMcp.y - pinkyMcp.y) ** 2
    ) * 0.6;

    // Color based on side
    const baseColor = side === 'left' ? [139, 233, 253] : [255, 121, 198];
    const glowIntensity = Math.min(1, speed / 1.5);

    ctx.save();

    // === BLADE BODY (tapered shape from wrist to extended tip) ===
    ctx.beginPath();
    // Start at wrist, left edge
    ctx.moveTo(wrist.x + perpX * baseWidth, wrist.y + perpY * baseWidth);
    // Along thumb/index side to fingertips
    ctx.lineTo(indexMcp.x + perpX * baseWidth * 0.8, indexMcp.y + perpY * baseWidth * 0.8);
    ctx.lineTo(indexTip.x + perpX * baseWidth * 0.4, indexTip.y + perpY * baseWidth * 0.4);
    // Tip (pointed)
    ctx.lineTo(tipX, tipY);
    // Back along pinky side
    ctx.lineTo(pinkyTip.x - perpX * baseWidth * 0.4, pinkyTip.y - perpY * baseWidth * 0.4);
    ctx.lineTo(pinkyMcp.x - perpX * baseWidth * 0.8, pinkyMcp.y - perpY * baseWidth * 0.8);
    // Back to wrist, right edge
    ctx.lineTo(wrist.x - perpX * baseWidth, wrist.y - perpY * baseWidth);
    ctx.closePath();

    // Gradient fill along blade length
    const gradient = ctx.createLinearGradient(wrist.x, wrist.y, tipX, tipY);
    gradient.addColorStop(0, `rgba(${baseColor.join(',')}, 0.1)`);
    gradient.addColorStop(0.3, `rgba(${baseColor.join(',')}, ${0.25 + glowIntensity * 0.2})`);
    gradient.addColorStop(0.7, `rgba(${baseColor.join(',')}, ${0.4 + glowIntensity * 0.3})`);
    gradient.addColorStop(1, `rgba(255, 255, 255, ${0.6 + glowIntensity * 0.4})`);

    ctx.shadowColor = `rgb(${baseColor.join(',')})`;
    ctx.shadowBlur = 20 + glowIntensity * 25;
    ctx.fillStyle = gradient;
    ctx.fill();

    // === BLADE EDGE (bright center line) ===
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + glowIntensity * 0.5})`;
    ctx.lineWidth = 2 + glowIntensity * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wrist.x, wrist.y);
    ctx.quadraticCurveTo(midTip.x, midTip.y, tipX, tipY);
    ctx.stroke();

    // === BLADE TIP GLOW ===
    ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + glowIntensity * 0.3})`;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4 + glowIntensity * 4, 0, Math.PI * 2);
    ctx.fill();

    // === HANDLE (small circle at wrist) ===
    ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(${baseColor.join(',')}, 0.6)`;
    ctx.beginPath();
    ctx.arc(wrist.x, wrist.y, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  clearPoseCanvas() {
    this.poseCtx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * No-op for compatibility (we don't use Three.js render anymore)
   */
  render() {}

  getFruitColor(type) {
    return this.fruitColorCSS[type] || '#8be9fd';
  }

  clearAllMeshes() {
    this.rotations.clear();
    this.trailPoints.left.length = 0;
    this.trailPoints.right.length = 0;
  }
}
