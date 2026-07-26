import type { Vec } from '../types';
import { WORLD } from '../constants';

/**
 * Camera: world metres -> screen pixels. `zoom` is px per metre.
 * World y grows north; screen y grows down, so the transform flips y.
 */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.055;
export const MAX_ZOOM = 3.2;

export function worldToScreen(cam: Camera, w: number, h: number, p: Vec): Vec {
  return {
    x: w / 2 + (p.x - cam.x) * cam.zoom,
    y: h / 2 - (p.y - cam.y) * cam.zoom,
  };
}

export function screenToWorld(cam: Camera, w: number, h: number, sx: number, sy: number): Vec {
  return {
    x: cam.x + (sx - w / 2) / cam.zoom,
    y: cam.y - (sy - h / 2) / cam.zoom,
  };
}

export function panBy(cam: Camera, dxPx: number, dyPx: number): void {
  cam.x -= dxPx / cam.zoom;
  cam.y += dyPx / cam.zoom;
  clampCamera(cam);
}

/** Zoom about a screen anchor so the point under the cursor stays put. */
export function zoomAt(cam: Camera, w: number, h: number, sx: number, sy: number, factor: number): void {
  const before = screenToWorld(cam, w, h, sx, sy);
  cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
  const after = screenToWorld(cam, w, h, sx, sy);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  clampCamera(cam);
}

export function clampCamera(cam: Camera): void {
  const margin = 1500;
  cam.x = Math.max(WORLD.minX - margin, Math.min(WORLD.maxX + margin, cam.x));
  cam.y = Math.max(WORLD.minY - margin, Math.min(WORLD.maxY + margin, cam.y));
}

/** Apply the camera as a canvas transform (world-space drawing). */
export function applyTransform(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number): void {
  ctx.setTransform(cam.zoom, 0, 0, -cam.zoom, w / 2 - cam.x * cam.zoom, h / 2 + cam.y * cam.zoom);
}
