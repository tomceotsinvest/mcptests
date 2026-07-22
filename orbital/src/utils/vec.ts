/**
 * vec.ts — tiny 2D vector helpers.
 *
 * We deliberately operate on plain {x,y} objects and return primitives where we
 * can, to keep the hot sim loop allocation-light. Functions that must return a
 * vector take an optional `out` to write into an existing object (pooling).
 */
export type Vec2 = { x: number; y: number };

export function set(out: Vec2, x: number, y: number): Vec2 {
  out.x = x;
  out.y = y;
  return out;
}

export function copy(out: Vec2, a: Vec2): Vec2 {
  out.x = a.x;
  out.y = a.y;
  return out;
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function len2(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** z-component of the 2D cross product (a × b). Sign gives rotational sense. */
export function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smallest signed angle difference b-a wrapped to [-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
