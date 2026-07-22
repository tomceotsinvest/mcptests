/**
 * physics.ts — hand-rolled simulation math (§5). Pure-ish functions that mutate
 * the passed ship; no rendering, no allocation in the hot path.
 *
 * The whole game lives in three transitions:
 *   free-flight  --capture-->  orbit  --release-->  free-flight
 *
 * Orbit is parametric (angle + radius around a center), NOT force-integrated —
 * this gives a clean, readable, always-solvable arc and an exact release tangent.
 */
import { T } from '@/config/tuning';
import { clamp, cross } from '@/utils/vec';
import type { Planet, Ship } from '@/world/entities';

/**
 * Find the planet whose *surface* is within CAPTURE_RADIUS of the ship and is
 * nearest. Rogue planets are excluded from capture (they cost a grip-miss).
 * Returns null if nothing is in range.
 */
export function findCaptureTarget(
  ship: Ship,
  planets: { get(i: number): Planet; activeCount: number },
): Planet | null {
  let best: Planet | null = null;
  let bestD = Infinity;
  for (let i = 0; i < planets.activeCount; i++) {
    const p = planets.get(i);
    if (p.kind === 'rogue') continue;
    const dx = ship.x - p.x;
    const dy = ship.y - p.y;
    const d = Math.hypot(dx, dy);
    const surfaceGap = d - p.r; // distance from the planet's edge
    if (surfaceGap <= T.CAPTURE_RADIUS && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Snap the ship into orbit around `planet`, preserving its rotational sense. */
export function captureShip(ship: Ship, planet: Planet): void {
  const dx = ship.x - planet.x;
  const dy = ship.y - planet.y;
  const dist = Math.hypot(dx, dy) || 0.0001;

  const radius = clamp(dist, T.MIN_ORBIT_R, T.MAX_ORBIT_R);
  const theta = Math.atan2(dy, dx);

  // spin direction = sign of (r × v); keep the ship's existing turn sense.
  const c = cross(dx, dy, ship.vx, ship.vy);
  const spinDir: 1 | -1 = c >= 0 ? 1 : -1;

  // faster incoming ships orbit faster.
  const vmag = Math.hypot(ship.vx, ship.vy);
  const omega = T.ORBIT_BASE_OMEGA + vmag * T.OMEGA_SPEED_COEFF;

  ship.mode = 'orbit';
  ship.planet = planet;
  ship.radius = radius;
  ship.theta = theta;
  ship.omega = omega;
  ship.spinDir = spinDir;
  // snap position exactly onto the orbit circle so there is no visual pop.
  ship.x = planet.x + radius * Math.cos(theta);
  ship.y = planet.y + radius * Math.sin(theta);
}

/**
 * Advance one orbit sim-step. `dt` is the (possibly time-scaled) step. Returns
 * nothing; mutates ship position, angle and radius (gentle inward spiral).
 */
export function stepOrbit(ship: Ship, dt: number): void {
  const p = ship.planet;
  if (!p) return;

  ship.theta += ship.spinDir * ship.omega * dt;

  // gentle inward decay so camping an orbit forever isn't optimal.
  ship.radius = Math.max(T.MIN_ORBIT_R, ship.radius - T.ORBIT_DECAY * dt);

  ship.x = p.x + ship.radius * Math.cos(ship.theta);
  ship.y = p.y + ship.radius * Math.sin(ship.theta);

  // ship faces along its instantaneous tangent.
  const tx = -Math.sin(ship.theta) * ship.spinDir;
  const ty = Math.cos(ship.theta) * ship.spinDir;
  ship.heading = Math.atan2(ty, tx);
}

/** Instantaneous tangent velocity at the current orbit state (before boost). */
export function tangentVelocity(ship: Ship): { vx: number; vy: number } {
  const tangentSpeed = ship.omega * ship.radius;
  const tx = -Math.sin(ship.theta) * ship.spinDir;
  const ty = Math.cos(ship.theta) * ship.spinDir;
  return { vx: tx * tangentSpeed, vy: ty * tangentSpeed };
}

/** Release from orbit: fly off on the tangent with the slingshot boost. */
export function releaseShip(ship: Ship): void {
  const { vx, vy } = tangentVelocity(ship);
  const boost = 1 + T.SLINGSHOT_BOOST;
  ship.vx = vx * boost;
  ship.vy = vy * boost;
  ship.heading = Math.atan2(ship.vy, ship.vx);
  ship.mode = 'flight';
  ship.planet = null;
}

/**
 * Advance one free-flight sim-step (§5.2). The world is modelled in absolute
 * coordinates; the relentless upward scroll is realised on the CAMERA (a rising
 * kill-line), not as a fake force here, so free flight is a clean straight line
 * for readability. The ship coasts; only optional ambient gravity bends it.
 */
export function stepFlight(ship: Ship, dt: number, nearest: Planet | null): void {
  if (T.AMBIENT_GRAVITY_FACTOR > 0 && nearest) {
    const dx = nearest.x - ship.x;
    const dy = nearest.y - ship.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) {
      const inv = 1 / Math.sqrt(d2);
      const g = (T.AMBIENT_GRAVITY_FACTOR * nearest.r * nearest.r) / d2;
      ship.vx += dx * inv * g * dt;
      ship.vy += dy * inv * g * dt;
    }
  }

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  ship.heading = Math.atan2(ship.vy, ship.vx);
}

/**
 * Is the current release heading within PERFECT_CONE_DEG of the direction to
 * the next planet's (current) position? Called at the instant of release.
 */
export function isPerfectRelease(ship: Ship, next: Planet | null): boolean {
  if (!next) return false;
  const { vx, vy } = tangentVelocity(ship);
  const vmag = Math.hypot(vx, vy) || 1;
  const dx = next.x - ship.x;
  const dy = next.y - ship.y;
  const dmag = Math.hypot(dx, dy) || 1;
  const cosAngle = (vx * dx + vy * dy) / (vmag * dmag);
  const cone = Math.cos((T.PERFECT_CONE_DEG * Math.PI) / 180);
  return cosAngle >= cone;
}
