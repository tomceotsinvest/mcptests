/**
 * loop.ts — fixed-timestep accumulator (§5.1).
 *
 * Simulation runs at a fixed DT regardless of render rate. We accumulate real
 * frame time, run 0..MAX_STEPS_PER_FRAME sim steps, and expose an interpolation
 * `alpha` in [0,1) for the renderer to blend the last two states. This keeps
 * physics deterministic and frame-rate independent, and caps work per frame to
 * avoid the spiral of death after a hitch.
 */
import { SIM } from '@/config/tuning';

export interface Accumulator {
  acc: number;
  alpha: number;
  steps: number; // steps run this frame (for debug/perf)
}

export function makeAccumulator(): Accumulator {
  return { acc: 0, alpha: 0, steps: 0 };
}

/**
 * Feed a real frame delta (seconds). Calls `step(dt)` for each fixed sim step
 * that fits, then sets `alpha` for interpolation. `timeScale` bends time (e.g.
 * HOLD_TIME_SCALE while orbiting) without breaking the fixed step.
 */
export function advance(
  a: Accumulator,
  frameDt: number,
  timeScale: number,
  step: (dt: number) => void,
): void {
  // clamp pathological frame times (tab-in after a stall, first frame, etc.)
  const clamped = Math.min(frameDt, SIM.DT * SIM.MAX_STEPS_PER_FRAME);
  a.acc += clamped * timeScale;

  a.steps = 0;
  while (a.acc >= SIM.DT && a.steps < SIM.MAX_STEPS_PER_FRAME) {
    step(SIM.DT);
    a.acc -= SIM.DT;
    a.steps++;
  }
  a.alpha = a.acc / SIM.DT;
}
