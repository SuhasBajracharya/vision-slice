/**
 * Generic object pool to avoid GC pressure.
 * Create objects once, recycle them.
 */
export class ObjectPool {
  /**
   * @param {Function} factory - Creates a new object
   * @param {Function} reset - Resets an object for reuse
   * @param {number} initialSize - Pre-allocate this many
   */
  constructor(factory, reset, initialSize = 20) {
    this.factory = factory;
    this.resetFn = reset;
    this.pool = [];
    this.active = [];

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
    }
  }

  /** Get an object from the pool (or create one) */
  acquire() {
    let obj;
    if (this.pool.length > 0) {
      obj = this.pool.pop();
    } else {
      obj = this.factory();
    }
    this.active.push(obj);
    return obj;
  }

  /** Return an object to the pool */
  release(obj) {
    const idx = this.active.indexOf(obj);
    if (idx !== -1) {
      this.active.splice(idx, 1);
    }
    this.resetFn(obj);
    this.pool.push(obj);
  }

  /** Release all active objects */
  releaseAll() {
    while (this.active.length > 0) {
      const obj = this.active.pop();
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }

  /** Get currently active objects */
  getActive() {
    return this.active;
  }
}
