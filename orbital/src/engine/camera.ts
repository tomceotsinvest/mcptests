/**
 * camera.ts — soft-lead follow + trauma-based screen shake (§4).
 *
 * The camera targets a point CAM_LEAD ahead of the ship along its velocity and
 * lerps toward it (never hard-cuts). Shake is trauma-based: events add trauma,
 * it decays each frame, and offset ∝ trauma² so small bumps are subtle and big
 * hits punch. Vertical world: the camera's y is what scrolls.
 */
import { T } from '@/config/tuning';
import { clamp } from '@/utils/vec';

export interface Camera {
  x: number; // world-space center the camera looks at
  y: number;
  trauma: number; // 0..1
  shakeX: number; // resolved per-frame shake offset (screen px)
  shakeY: number;
  seed: number; // drives deterministic-ish shake noise
}

export function makeCamera(): Camera {
  return { x: 0, y: 0, trauma: 0, shakeX: 0, shakeY: 0, seed: 1 };
}

export function addTrauma(cam: Camera, amount: number): void {
  cam.trauma = clamp(cam.trauma + amount, 0, 1);
}

/**
 * Advance the camera one *frame* (not sim step). `dt` is real frame time.
 * The camera looks at the ship plus a velocity-scaled lead, lerped by CAM_LERP.
 */
export function updateCamera(
  cam: Camera,
  shipX: number,
  shipY: number,
  shipVX: number,
  shipVY: number,
  dt: number,
): void {
  const speed = Math.hypot(shipVX, shipVY) || 1;
  const leadX = (shipVX / speed) * T.CAM_LEAD;
  const leadY = (shipVY / speed) * T.CAM_LEAD;
  const targetX = shipX + leadX;
  const targetY = shipY + leadY;

  // Frame-rate independent lerp: treat CAM_LERP as per-60fps-frame smoothing.
  const k = 1 - Math.pow(1 - T.CAM_LERP, dt * 60);
  cam.x += (targetX - cam.x) * k;
  cam.y += (targetY - cam.y) * k;

  // trauma decay + resolve shake
  cam.trauma = clamp(cam.trauma - T.TRAUMA_DECAY * dt, 0, 1);
  const shake = cam.trauma * cam.trauma;
  if (shake > 0) {
    // cheap deterministic noise via incremental hash on seed
    cam.seed = (cam.seed * 1664525 + 1013904223) >>> 0;
    const n1 = (cam.seed / 4294967296) * 2 - 1;
    cam.seed = (cam.seed * 1664525 + 1013904223) >>> 0;
    const n2 = (cam.seed / 4294967296) * 2 - 1;
    cam.shakeX = n1 * shake * T.SHAKE_MAX_PX;
    cam.shakeY = n2 * shake * T.SHAKE_MAX_PX;
  } else {
    cam.shakeX = 0;
    cam.shakeY = 0;
  }
}
