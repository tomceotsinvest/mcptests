/**
 * rng.ts — seeded deterministic PRNG (mulberry32).
 *
 * Same seed -> same stream, so procedural layouts are reproducible for the
 * "seed of the day" mode and for deterministic replays. Fast, allocation-free.
 */
export class RNG {
  private state: number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed || 1;
  }

  /** float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1));
  }

  /** true with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
}

/** Derive a stable per-chunk seed from a run seed and chunk index. */
export function chunkSeed(runSeed: number, chunkIndex: number): number {
  // splitmix-ish mix so adjacent chunks look uncorrelated.
  let h = (runSeed ^ Math.imul(chunkIndex + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
