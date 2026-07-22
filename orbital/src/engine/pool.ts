/**
 * pool.ts — generic fixed-capacity object pool.
 *
 * The whole point: never allocate during an active run. Pre-fill the pool at
 * boot, `obtain()` to activate an object, `release()` to recycle. Iteration is
 * over the dense `active` prefix so draw/sim loops stay cache-friendly.
 */
export class Pool<T> {
  private readonly items: T[];
  private readonly reset: (item: T) => void;
  /** number of live items; items[0..activeCount-1] are active. */
  activeCount = 0;

  constructor(capacity: number, factory: () => T, reset: (item: T) => void) {
    this.items = new Array(capacity);
    for (let i = 0; i < capacity; i++) this.items[i] = factory();
    this.reset = reset;
  }

  get capacity(): number {
    return this.items.length;
  }

  /** Activate and return the next free item, or null if the pool is full. */
  obtain(): T | null {
    if (this.activeCount >= this.items.length) return null;
    const item = this.items[this.activeCount]!;
    this.activeCount++;
    this.reset(item);
    return item;
  }

  /** Release the active item at index `i` by swapping it with the last active. */
  releaseAt(i: number): void {
    const last = this.activeCount - 1;
    if (i < 0 || i > last) return;
    const tmp = this.items[i]!;
    this.items[i] = this.items[last]!;
    this.items[last] = tmp;
    this.activeCount--;
  }

  /** Run a callback over active items; return true from cb to release that item. */
  forEachActive(cb: (item: T, index: number) => boolean | void): void {
    for (let i = 0; i < this.activeCount; ) {
      const remove = cb(this.items[i]!, i);
      if (remove === true) this.releaseAt(i);
      else i++;
    }
  }

  get(i: number): T {
    return this.items[i]!;
  }

  clear(): void {
    this.activeCount = 0;
  }
}
