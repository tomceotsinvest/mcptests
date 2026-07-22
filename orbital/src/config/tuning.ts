/**
 * tuning.ts — the single source of truth for every gameplay number.
 *
 * RULE: no gameplay magic number may live anywhere else in the codebase.
 * The dev Tuning Panel (M6) binds live sliders to these fields, so keep them
 * flat and primitive where possible.
 *
 * Values below are the *starting* constants from the design brief (§5.7).
 * They are the game feel — change them here, feel the difference everywhere.
 */
export const TUNING = {
  // ---- world ----
  WORLD_SPEED_START: 220, // px/s baseline scroll
  WORLD_SPEED_RAMP: 6, // +px/s added every RAMP_INTERVAL
  WORLD_SPEED_MAX: 640,
  RAMP_INTERVAL: 8, // seconds between speed increases
  OFFSCREEN_MARGIN: 120, // px past edge before death

  // ---- capture / orbit ----
  CAPTURE_RADIUS: 150, // px from planet surface to allow grip
  MIN_ORBIT_R: 46,
  MAX_ORBIT_R: 190,
  ORBIT_BASE_OMEGA: 2.4, // rad/s
  OMEGA_SPEED_COEFF: 0.0018,
  ORBIT_DECAY: 10, // px/s radius shrink while held
  HOLD_TIME_SCALE: 0.92,

  // ---- release ----
  SLINGSHOT_BOOST: 0.12, // +12% speed on launch
  PERFECT_CONE_DEG: 14,
  PERFECT_BONUS_DUST: 5,

  // ---- ambient / fall ----
  AMBIENT_GRAVITY_FACTOR: 0.0, // weak pull from the nearest planet in free-flight
  FALL_G: 280, // px/s^2 constant downward pull in free-flight ("always falling")
  CLOUD_DRAG: 0.86,

  // ---- combo / score ----
  COMBO_STEP: 0.15,
  COMBO_MAX: 6.0,

  // ---- camera / juice ----
  CAM_LEAD: 90,
  CAM_LERP: 0.1,
  TRAUMA_DECAY: 1.4, // trauma units/sec
  SHAKE_MAX_PX: 22,

  // ---- economy ----
  DUST_PER_PICKUP: 1,
} as const;

// A mutable, live-editable mirror used by the dev Tuning Panel. Gameplay code
// should read from `T` so sliders take effect immediately. In production this
// is identical to TUNING.
export type TuningShape = { -readonly [K in keyof typeof TUNING]: number };

export const T: TuningShape = { ...TUNING };

/** Reset the live tuning back to the shipped defaults. */
export function resetTuning(): void {
  Object.assign(T, TUNING);
}

// ---- simulation constants (not player-facing feel, but central) ----
export const SIM = {
  DT: 1 / 120, // fixed simulation timestep (seconds)
  MAX_STEPS_PER_FRAME: 5, // spiral-of-death guard
  TRAIL_LENGTH: 40, // ship positions kept for the ribbon
  CHUNK_H: 600, // px height of a procedural generation band
  PX_PER_METER: 12, // scroll pixels -> displayed "metres" of distance
  DUST_PICKUP_R: 26, // px radius the ship sweeps up stardust within
  PLANET_POOL: 24, // pooled planets alive at once
  DUST_POOL: 120,
  HAZARD_POOL: 40,
} as const;
