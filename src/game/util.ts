import type { Vec } from './types';

/* ------------------------------------------------------------------ RNG */

/** Deterministic mulberry32; the whole map derives from one seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng: () => number, a: number, b: number) => a + (b - a) * rng();

/** log-normal-ish sample via product of uniforms; cheap and good enough */
export function lognormal(rng: () => number, median: number, spread: number): number {
  const n = (rng() + rng() + rng() + rng() - 2) / 2; // ~normal(0,~0.4)
  return median * Math.exp(n * spread);
}

export function pickWeighted(rng: () => number, weights: number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/* ------------------------------------------------------------- geometry */

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerpVec = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function polylineLength(pts: Vec[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

export function cumulative(pts: Vec[]): number[] {
  const cum = new Array<number>(pts.length);
  cum[0] = 0;
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
  return cum;
}

/** Position + heading at distance s along a polyline with cumulative dists. */
export function pointAt(pts: Vec[], cum: number[], s: number): { p: Vec; heading: number } {
  if (s <= 0) return { p: pts[0], heading: headingOf(pts[0], pts[Math.min(1, pts.length - 1)]) };
  const total = cum[cum.length - 1];
  if (s >= total) {
    const n = pts.length;
    return { p: pts[n - 1], heading: headingOf(pts[Math.max(0, n - 2)], pts[n - 1]) };
  }
  // binary search
  let lo = 0;
  let hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  return { p: lerpVec(pts[lo], pts[hi], t), heading: headingOf(pts[lo], pts[hi]) };
}

const headingOf = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);

/** Resample a polyline so no segment exceeds `spacing` metres. */
export function resample(pts: Vec[], spacing: number): Vec[] {
  const out: Vec[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    const n = Math.max(1, Math.ceil(d / spacing));
    for (let k = 1; k <= n; k++) out.push(lerpVec(pts[i - 1], pts[i], k / n));
  }
  return out;
}

/** Segment intersection; returns t along (a,b) and u along (c,d) in (0,1). */
export function segIntersect(a: Vec, b: Vec, c: Vec, d: Vec): { t: number; u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return { t, u };
}

export function pointInPoly(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi.y > p.y !== pj.y > p.y && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distToPolyline(p: Vec, pts: Vec[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    best = Math.min(best, distToSeg(p, pts[i - 1], pts[i]));
  }
  return best;
}

export function distToSeg(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Project a point onto a polyline; returns distance-along and closest point. */
export function projectOnPolyline(p: Vec, pts: Vec[], cum: number[]): { s: number; p: Vec } {
  let bestD = Infinity;
  let bestS = 0;
  let bestP = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = dist(p, q);
    if (d < bestD) {
      bestD = d;
      bestS = cum[i - 1] + t * (cum[i] - cum[i - 1]);
      bestP = q;
    }
  }
  return { s: bestS, p: bestP };
}

/** Do segments (a,b) and any segment of `pts` intersect? */
export function segCrossesPolyline(a: Vec, b: Vec, pts: Vec[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (segIntersect(a, b, pts[i - 1], pts[i])) return true;
  }
  return false;
}

/* ------------------------------------------------------------- min-heap */

/** Binary min-heap keyed on cost, holding numeric ids. */
export class MinHeap {
  private ids: number[] = [];
  private costs: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, cost: number): void {
    this.ids.push(id);
    this.costs.push(cost);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { id: number; cost: number } | null {
    const n = this.ids.length;
    if (n === 0) return null;
    const top = { id: this.ids[0], cost: this.costs[0] };
    const lastId = this.ids.pop()!;
    const lastCost = this.costs.pop()!;
    if (n > 1) {
      this.ids[0] = lastId;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.costs[l] < this.costs[m]) m = l;
        if (r < this.ids.length && this.costs[r] < this.costs[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(i: number, j: number): void {
    [this.ids[i], this.ids[j]] = [this.ids[j], this.ids[i]];
    [this.costs[i], this.costs[j]] = [this.costs[j], this.costs[i]];
  }
}

/* --------------------------------------------------------- spatial grid */

/** Uniform hash grid for point items; used for stops, nodes, transfers. */
export class SpatialGrid {
  private cells = new Map<number, number[]>();

  constructor(
    private cellSize: number,
    private minX: number,
    private minY: number,
  ) {}

  private key(x: number, y: number): number {
    const cx = Math.floor((x - this.minX) / this.cellSize);
    const cy = Math.floor((y - this.minY) / this.cellSize);
    return cx * 100003 + cy;
  }

  insert(x: number, y: number, id: number): void {
    const k = this.key(x, y);
    const arr = this.cells.get(k);
    if (arr) arr.push(id);
    else this.cells.set(k, [id]);
  }

  clear(): void {
    this.cells.clear();
  }

  /** All ids in cells overlapping the radius (caller filters by true dist). */
  query(x: number, y: number, radius: number, out: number[]): number[] {
    out.length = 0;
    const c0x = Math.floor((x - radius - this.minX) / this.cellSize);
    const c1x = Math.floor((x + radius - this.minX) / this.cellSize);
    const c0y = Math.floor((y - radius - this.minY) / this.cellSize);
    const c1y = Math.floor((y + radius - this.minY) / this.cellSize);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        const arr = this.cells.get(cx * 100003 + cy);
        if (arr) for (const id of arr) out.push(id);
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------ formatting */

export function fmtMoney(v: number): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}£${(a / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `${sign}£${(a / 1e6).toFixed(1)}m`;
  if (a >= 1e3) return `${sign}£${(a / 1e3).toFixed(0)}k`;
  return `${sign}£${a.toFixed(0)}`;
}

export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('en-GB');
}
