/**
 * Lightweight 2D canvas-based particle effects for fruit slicing.
 */
export class ParticleSystem {
  constructor(ctx) {
    this.ctx = ctx; // pose canvas (for particles on top)
    this.gameCtx = null; // game canvas (for splatters behind everything)
    this.particles = [];
    this.splatters = [];
  }

  /**
   * Set the game canvas context for drawing splatters behind everything.
   */
  setGameContext(gameCtx) {
    this.gameCtx = gameCtx;
  }

  /**
   * Emit particles at a position with a given color.
   * @param {number} x - screen X
   * @param {number} y - screen Y
   * @param {string} color - CSS color
   * @param {number} count - number of particles
   */
  emit(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1.0,
        decay: 0.015 + Math.random() * 0.025,
        size: 3 + Math.random() * 5,
        color,
      });
    }
  }

  /** Emit a juice splash (half-circle splatter from slice direction) */
  emitSlice(x, y, color, dirX = 0, dirY = -1) {
    const baseAngle = Math.atan2(dirY, dirX);
    for (let i = 0; i < 18; i++) {
      const spread = (Math.random() - 0.5) * Math.PI;
      const angle = baseAngle + spread;
      const speed = 3 + Math.random() * 7;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.012 + Math.random() * 0.02,
        size: 2 + Math.random() * 6,
        color,
      });
    }
  }

  /** Bomb explosion — red/orange burst */
  emitExplosion(x, y) {
    const colors = ['#ff5555', '#ffb86c', '#f1fa8c', '#ff79c6'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 10;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.01 + Math.random() * 0.015,
        size: 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  /**
   * Massive bomb explosion — fills a large area with debris, sparks, shockwave.
   */
  emitBombExplosion(x, y, screenW, screenH) {
    // Inner fireball
    const fireColors = ['#ff5555', '#ff4444', '#ffb86c', '#f1fa8c', '#ffffff'];
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 14;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1.0,
        decay: 0.008 + Math.random() * 0.012,
        size: 6 + Math.random() * 14,
        color: fireColors[Math.floor(Math.random() * fireColors.length)],
      });
    }

    // Outer shockwave ring (large particles moving outward fast)
    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2;
      const speed = 12 + Math.random() * 8;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.01,
        size: 3 + Math.random() * 5,
        color: `rgba(255, ${150 + Math.floor(Math.random() * 105)}, 50, 1)`,
      });
    }

    // Debris chunks that fly to edges
    const debrisColors = ['#44475a', '#6272a4', '#ff5555', '#ffb86c'];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 18;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + Math.random() * 4,
        life: 1.0,
        decay: 0.006 + Math.random() * 0.008,
        size: 8 + Math.random() * 12,
        color: debrisColors[Math.floor(Math.random() * debrisColors.length)],
      });
    }

    // Smoke (slow, big, dark)
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1.0,
        decay: 0.005 + Math.random() * 0.005,
        size: 15 + Math.random() * 25,
        color: 'rgba(68, 71, 90, 0.6)',
      });
    }
  }

  /**
   * Create a juice splatter stain at a position.
   * @param {number} x - screen X
   * @param {number} y - screen Y
   * @param {string} color - CSS color of the fruit
   * @param {number} handVx - hand velocity X for directionality
   * @param {number} handVy - hand velocity Y
   */
  emitSplatter(x, y, color, handVx = 0, handVy = 0) {
    const speed = Math.sqrt(handVx * handVx + handVy * handVy);
    const count = 4 + Math.floor(Math.random() * 4);

    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(handVy, handVx) + (Math.random() - 0.5) * Math.PI;
      const dist = 15 + Math.random() * 60 + speed * 8;
      const bx = x + Math.cos(angle) * dist;
      const by = y + Math.sin(angle) * dist;

      const blobCount = 3 + Math.floor(Math.random() * 4);
      const blobs = [];
      for (let j = 0; j < blobCount; j++) {
        blobs.push({
          ox: (Math.random() - 0.5) * 18,
          oy: (Math.random() - 0.5) * 18,
          r: 5 + Math.random() * 15,
        });
      }

      const drips = [];
      const dripCount = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 2) : 0;
      for (let j = 0; j < dripCount; j++) {
        drips.push({
          ox: (Math.random() - 0.5) * 10,
          length: 20 + Math.random() * 50,
          width: 2 + Math.random() * 4,
          speed: 10 + Math.random() * 20,
          progress: 0,
        });
      }

      this.splatters.push({
        x: bx,
        y: by,
        color,
        blobs,
        drips,
        life: 1.0,
        decay: 0.9 + Math.random() * 0.3, // ~1 second fade
        age: 0,
      });
    }

    // Central splat
    const centralBlobs = [];
    for (let j = 0; j < 6; j++) {
      centralBlobs.push({
        ox: (Math.random() - 0.5) * 25,
        oy: (Math.random() - 0.5) * 25,
        r: 8 + Math.random() * 20,
      });
    }
    const centralDrips = [];
    for (let j = 0; j < 2; j++) {
      centralDrips.push({
        ox: (Math.random() - 0.5) * 12,
        length: 30 + Math.random() * 70,
        width: 3 + Math.random() * 5,
        speed: 15 + Math.random() * 25,
        progress: 0,
      });
    }
    this.splatters.push({
      x,
      y,
      color,
      blobs: centralBlobs,
      drips: centralDrips,
      life: 1.0,
      decay: 0.8 + Math.random() * 0.3, // ~1 second fade
      age: 0,
    });
  }

  /** Draw splatters on the GAME canvas (behind fruits).
   * Call this BEFORE drawing game objects.
   */
  drawSplatters(dt) {
    const ctx = this.gameCtx;
    if (!ctx) return;

    for (let i = this.splatters.length - 1; i >= 0; i--) {
      const s = this.splatters[i];
      s.age += dt;
      s.life -= s.decay * dt;

      if (s.life <= 0) {
        this.splatters.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = s.life * 0.6;

      // Draw blobs
      for (const blob of s.blobs) {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x + blob.ox, s.y + blob.oy, blob.r * (0.8 + s.life * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw drips
      for (const drip of s.drips) {
        drip.progress = Math.min(1, drip.progress + (drip.speed * dt) / drip.length);
        const dripLen = drip.length * drip.progress;

        ctx.strokeStyle = s.color;
        ctx.lineWidth = drip.width * s.life;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x + drip.ox, s.y);
        ctx.lineTo(s.x + drip.ox, s.y + dripLen);
        ctx.stroke();

        if (drip.progress < 1) {
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(s.x + drip.ox, s.y + dripLen, drip.width * 0.8 * s.life, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  /** Update and draw particles only (on pose canvas, on top) */
  update(dt) {
    const ctx = this.ctx;

    // Only regular particles here — splatters drawn separately via drawSplatters()
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= p.decay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Clear all particles and splatters */
  clear() {
    this.particles.length = 0;
    this.splatters.length = 0;
  }
}
