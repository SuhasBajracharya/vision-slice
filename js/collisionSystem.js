/**
 * Collision detection using bounding box + trajectory intersection.
 */
export class CollisionSystem {
  constructor() {
    this.minSliceSpeed = 0.3;
    this.handRadius = 0.05;
    // Track recently sliced object IDs to prevent double-hits on same swipe
    this.recentHits = new Map(); // id -> timestamp
    this.hitCooldown = 150; // ms cooldown before same object can be hit again
  }

  checkCollision(hand, obj) {
    if (!hand.visible) return false;
    if (hand.speed < this.minSliceSpeed) return false;

    const dx = hand.x - obj.x;
    const dy = hand.y - obj.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const combinedRadius = this.handRadius + obj.radius;

    if (dist < combinedRadius) return true;

    const dt = 1 / 60;
    const prevX = hand.x - hand.vx * dt;
    const prevY = hand.y - hand.vy * dt;
    return this._lineCircleIntersect(prevX, prevY, hand.x, hand.y, obj.x, obj.y, combinedRadius);
  }

  _lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;

    let discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return false;

    discriminant = Math.sqrt(discriminant);
    const t1 = (-b - discriminant) / (2 * a);
    const t2 = (-b + discriminant) / (2 * a);

    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
  }

  checkAll(hands, objects) {
    const now = performance.now();
    const hits = [];

    // Clean old cooldowns
    for (const [id, t] of this.recentHits) {
      if (now - t > this.hitCooldown) this.recentHits.delete(id);
    }

    for (const obj of objects) {
      if (obj.fading) continue;

      // Check cooldown
      if (this.recentHits.has(obj.id)) continue;

      for (const side of ['left', 'right']) {
        const hand = hands[side];
        if (this.checkCollision(hand, obj)) {
          hits.push({ object: obj, hand, side });
          this.recentHits.set(obj.id, now);
          break;
        }
      }
    }
    return hits;
  }
}
