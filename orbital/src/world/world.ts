/**
 * world.ts — the live game runtime (§3: gameplay state is plain mutable objects
 * in the loop, NOT React state, so play never triggers a re-render).
 *
 * Owns the ship, pooled planets/dust/hazards, camera, trail ring-buffer, score
 * and input intent. Exposes:
 *   - createWorld(seed, viewport)
 *   - pressDown / pressUp          (input edges from the touch handler)
 *   - simStep(dt)                  (one fixed sim step; called by the loop)
 *   - frame(realDt)                (per-render-frame: camera, trail, scroll)
 *
 * Coordinate convention: world Y grows DOWNWARD (screen convention). "Climbing"
 * = moving toward NEGATIVE y. The relentless scroll is a rising kill-line
 * (camera forced toward -y), so the ship must slingshot upward to survive (§6).
 */
import { SIM, T } from '@/config/tuning';
import { addTrauma, makeCamera, updateCamera, type Camera } from '@/engine/camera';
import { Pool } from '@/engine/pool';
import {
  captureShip,
  findCaptureTarget,
  isPerfectRelease,
  releaseShip,
  stepFlight,
  stepOrbit,
} from '@/engine/physics';
import { RNG } from '@/engine/rng';
import {
  makeDust,
  makeHazard,
  makePlanet,
  makeShip,
  type Dust,
  type Hazard,
  type Planet,
  type Ship,
} from '@/world/entities';

export type GameEventKind =
  | 'capture'
  | 'release'
  | 'perfect'
  | 'gripMiss'
  | 'dust'
  | 'death'
  | 'combo';

export interface GameEvent {
  kind: GameEventKind;
  x: number;
  y: number;
  data?: number; // combo value, hue, etc.
}

export interface Viewport {
  w: number;
  h: number;
  top: number; // safe-area insets
  bottom: number;
  left: number;
  right: number;
}

export interface World {
  ship: Ship;
  planets: Pool<Planet>;
  dust: Pool<Dust>;
  hazards: Pool<Hazard>;
  camera: Camera;

  // trail ring buffer
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead: number;
  trailCount: number;

  // input intent (edges set by touch handler, consumed in sim)
  holding: boolean;
  pendingCapture: boolean;
  gripFlash: number; // seconds remaining on the grip-miss flash

  // world / score
  seed: number;
  rng: RNG;
  vp: Viewport;
  forcedFloorY: number; // rising kill-line baseline (most-negative reached)
  startFloorY: number;
  worldSpeed: number;
  elapsed: number; // seconds of active play
  rampTimer: number;
  distanceM: number; // metres travelled (primary score)
  stardust: number;
  combo: number;
  multiplier: number;
  nextPlanetId: number;
  topPlanetY: number; // most-negative y a planet currently occupies
  topPlanetX: number; // x of the current top planet (for reachable chaining)

  dead: boolean;

  // event queue drained each frame by the presentation layer (audio/haptics/fx)
  events: GameEvent[];

  // perf
  simStepsThisFrame: number;
}

export function createWorld(seed: number, vp: Viewport): World {
  const w: World = {
    ship: makeShip(),
    planets: new Pool<Planet>(SIM.PLANET_POOL, makePlanet, (p) => {
      p.reached = false;
      p.kind = 'normal';
    }),
    dust: new Pool<Dust>(SIM.DUST_POOL, makeDust, (d) => {
      d.collected = false;
    }),
    hazards: new Pool<Hazard>(SIM.HAZARD_POOL, makeHazard, () => {}),
    camera: makeCamera(),
    trailX: new Float32Array(SIM.TRAIL_LENGTH),
    trailY: new Float32Array(SIM.TRAIL_LENGTH),
    trailHead: 0,
    trailCount: 0,
    holding: false,
    pendingCapture: false,
    gripFlash: 0,
    seed,
    rng: new RNG(seed),
    vp,
    forcedFloorY: 0,
    startFloorY: 0,
    worldSpeed: T.WORLD_SPEED_START,
    elapsed: 0,
    rampTimer: 0,
    distanceM: 0,
    stardust: 0,
    combo: 0,
    multiplier: 1,
    nextPlanetId: 1,
    topPlanetY: 0,
    topPlanetX: 0,
    dead: false,
    events: [],
    simStepsThisFrame: 0,
  };

  // ship starts mid-screen, climbing at the initial scroll speed so it keeps
  // pace with the world on frame one.
  w.ship.x = 0;
  w.ship.y = 0;
  w.ship.vx = 0;
  w.ship.vy = -T.WORLD_SPEED_START;
  w.ship.heading = -Math.PI / 2;
  w.camera.x = 0;
  w.camera.y = 0;

  // seed the starter field (M1: a simple recycled ladder; M2 replaces this with
  // the chunked, reachability-checked generator).
  seedStarterField(w);
  primeTrail(w);
  return w;
}

function primeTrail(w: World): void {
  for (let i = 0; i < SIM.TRAIL_LENGTH; i++) {
    w.trailX[i] = w.ship.x;
    w.trailY[i] = w.ship.y;
  }
  w.trailHead = 0;
  w.trailCount = 0;
}

/**
 * Planets live inside a centred BAND so they stay on-screen given the bounded
 * camera corridor (see `frame`). BAND + CORRIDOR must be < w/2 to stay visible.
 */
function bandHalf(w: World): number {
  return w.vp.w * 0.38;
}
function corridorHalf(w: World): number {
  return w.vp.w * 0.1;
}
function clampX(w: World, x: number): number {
  const half = bandHalf(w);
  return Math.max(-half, Math.min(half, x));
}

/**
 * Next planet x: a reachable step from the last (within ~1 gap, a ~45° cone),
 * but MEAN-REVERTING toward centre (the `* 0.45`) so the column samples
 * left/middle/right instead of random-walking into one edge and hugging it.
 */
function nextPlanetX(w: World, lastX: number, gap: number): number {
  const maxDX = Math.min(gap, bandHalf(w) * 2);
  return clampX(w, lastX * 0.45 + w.rng.range(-maxDX, maxDX));
}

/**
 * M1 starter field: planets climbing upward, each within a reachable cone of the
 * previous one (a ~45° step). M2 replaces this with the chunked generator that
 * runs an explicit reachability check at the current world speed.
 */
function seedStarterField(w: World): void {
  // First planet sits close and near-centre so the opening climb reaches it
  // before the ship stalls under gravity; the rest scatter left/middle/right.
  let y = -175;
  let lastX = w.rng.range(-30, 30);
  for (let i = 0; i < 7; i++) {
    const p = w.planets.obtain();
    if (!p) break;
    const gap = w.rng.range(210, 260);
    const x = i === 0 ? clampX(w, lastX) : nextPlanetX(w, lastX, gap);
    p.x = x;
    p.y = y;
    p.r = w.rng.range(24, 52);
    p.hue = w.rng.int(0, 3);
    p.kind = 'normal';
    p.reached = false;
    p.pulse = w.rng.range(0, Math.PI * 2);
    p.id = w.nextPlanetId++;
    scatterDustAround(w, p);
    lastX = x;
    y -= gap;
  }
  w.topPlanetY = y;
  w.topPlanetX = lastX;
}

/** Sprinkle a short arc of dust near a planet so good orbits are rewarded. */
function scatterDustAround(w: World, p: Planet): void {
  const n = 4;
  const base = w.rng.range(0, Math.PI * 2);
  const r = p.r + w.rng.range(30, 70);
  for (let i = 0; i < n; i++) {
    const d = w.dust.obtain();
    if (!d) return;
    const a = base + (i / n) * Math.PI * 1.1;
    d.x = p.x + Math.cos(a) * r;
    d.y = p.y + Math.sin(a) * r;
    d.collected = false;
    d.twinkle = w.rng.range(0, Math.PI * 2);
  }
}

/** Recycle planets that have fallen below the kill-line back up to the top. */
function recyclePlanets(w: World): void {
  const killY = w.camera.y + w.vp.h / 2 + T.OFFSCREEN_MARGIN + 200;
  w.planets.forEachActive((p) => {
    if (p.y > killY) {
      // re-spawn above the current top, scattered left/middle/right but still
      // within a reachable cone of it.
      const gap = w.rng.range(210, 260);
      w.topPlanetY -= gap;
      w.topPlanetX = nextPlanetX(w, w.topPlanetX, gap);
      p.x = w.topPlanetX;
      p.y = w.topPlanetY;
      p.r = w.rng.range(24, 52);
      p.hue = w.rng.int(0, 3);
      p.reached = false;
      p.pulse = w.rng.range(0, Math.PI * 2);
      p.id = w.nextPlanetId++;
      scatterDustAround(w, p);
    }
    return false;
  });
  // cull dust that fell below the line
  w.dust.forEachActive((d) => d.y > killY);
}

// ---- input edges ----
export function pressDown(w: World): void {
  if (w.dead) return;
  w.holding = true;
  w.pendingCapture = true;
}

export function pressUp(w: World): void {
  w.holding = false;
  if (w.ship.mode === 'orbit') doRelease(w);
}

/** Nearest active normal planet ahead of the ship (for perfect-window & lead). */
function nearestNextPlanet(w: World): Planet | null {
  let best: Planet | null = null;
  let bestD = Infinity;
  const s = w.ship;
  for (let i = 0; i < w.planets.activeCount; i++) {
    const p = w.planets.get(i);
    if (p === s.planet) continue;
    if (p.y > s.y + 40) continue; // must be ahead (upward)
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function doCaptureAttempt(w: World): void {
  const target = findCaptureTarget(w.ship, w.planets);
  if (target) {
    captureShip(w.ship, target);
    emit(w, 'capture', target.x, target.y, target.hue);
    addTrauma(w.camera, 0.12);
    if (!target.reached) {
      target.reached = true;
      w.combo += 1;
      w.multiplier = Math.min(T.COMBO_MAX, 1 + w.combo * T.COMBO_STEP);
      emit(w, 'combo', w.ship.x, w.ship.y, w.combo);
    }
  } else {
    // grip miss: teach range without hard punishment.
    w.gripFlash = 0.18;
    addTrauma(w.camera, 0.18);
    emit(w, 'gripMiss', w.ship.x, w.ship.y);
  }
}

function doRelease(w: World): void {
  const next = nearestNextPlanet(w);
  const perfect = isPerfectRelease(w.ship, next);
  releaseShip(w.ship);
  emit(w, 'release', w.ship.x, w.ship.y, w.multiplier);
  if (perfect) {
    const gain = T.PERFECT_BONUS_DUST;
    w.stardust += gain;
    addTrauma(w.camera, 0.25);
    emit(w, 'perfect', w.ship.x, w.ship.y, gain);
  }
}

// ---- simulation step (fixed dt) ----
export function simStep(w: World, dt: number): void {
  if (w.dead) return;
  const s = w.ship;

  // consume a capture edge (only attempted at touch-down, per §4).
  if (w.pendingCapture) {
    w.pendingCapture = false;
    if (s.mode === 'flight') doCaptureAttempt(w);
  }

  if (s.mode === 'orbit') {
    stepOrbit(s, dt);
  } else {
    stepFlight(s, dt, null);
  }

  if (s.invuln > 0) s.invuln -= dt;
  if (w.gripFlash > 0) w.gripFlash -= dt;

  collectDust(w);
  checkDeath(w);
}

function collectDust(w: World): void {
  const s = w.ship;
  const rr = SIM.DUST_PICKUP_R * SIM.DUST_PICKUP_R;
  w.dust.forEachActive((d) => {
    if (d.collected) return true;
    const dx = d.x - s.x;
    const dy = d.y - s.y;
    if (dx * dx + dy * dy <= rr) {
      d.collected = true;
      w.stardust += T.DUST_PER_PICKUP;
      emit(w, 'dust', d.x, d.y);
      return true; // release from pool
    }
    return false;
  });
}

function checkDeath(w: World): void {
  const s = w.ship;
  if (s.invuln > 0) return;
  const halfW = w.vp.w / 2 + T.OFFSCREEN_MARGIN;
  const topKill = w.camera.y - w.vp.h / 2 - T.OFFSCREEN_MARGIN;
  const bottomKill = w.camera.y + w.vp.h / 2 + T.OFFSCREEN_MARGIN;
  if (
    s.x < w.camera.x - halfW ||
    s.x > w.camera.x + halfW ||
    s.y < topKill ||
    s.y > bottomKill
  ) {
    kill(w);
  }
}

function kill(w: World): void {
  if (w.dead) return;
  w.dead = true;
  addTrauma(w.camera, 0.9);
  emit(w, 'death', w.ship.x, w.ship.y);
}

// ---- per-frame (render-rate) update: camera, scroll, trail ----
export function frame(w: World, realDt: number): void {
  if (!w.dead) {
    // world-speed ramp
    w.elapsed += realDt;
    w.rampTimer += realDt;
    if (w.rampTimer >= T.RAMP_INTERVAL) {
      w.rampTimer -= T.RAMP_INTERVAL;
      w.worldSpeed = Math.min(T.WORLD_SPEED_MAX, w.worldSpeed + T.WORLD_SPEED_RAMP);
    }
  }

  // camera: soft-lead follow, then forced rising floor (never falls behind).
  updateCamera(w.camera, w.ship.x, w.ship.y, w.ship.vx, w.ship.vy, realDt);
  // Clamp horizontal to a corridor so the ship lives within the screen width —
  // fling sideways and you cross the edge and die, instead of the camera chasing
  // you out into empty space with no planets in reach.
  const ch = corridorHalf(w);
  w.camera.x = Math.max(-ch, Math.min(ch, w.camera.x));
  if (!w.dead) {
    const decayed = w.forcedFloorY - w.worldSpeed * realDt;
    w.forcedFloorY = Math.min(decayed, w.camera.y);
    w.camera.y = w.forcedFloorY;
  }

  // distance (metres climbed) is monotonic in the floor's rise.
  w.distanceM = Math.max(0, (w.startFloorY - w.forcedFloorY) / SIM.PX_PER_METER);

  // planet breathing phase
  w.planets.forEachActive((p) => {
    p.pulse += realDt;
    return false;
  });

  // trail sample (once per frame)
  pushTrail(w);

  if (!w.dead) recyclePlanets(w);
}

function pushTrail(w: World): void {
  w.trailX[w.trailHead] = w.ship.x;
  w.trailY[w.trailHead] = w.ship.y;
  w.trailHead = (w.trailHead + 1) % SIM.TRAIL_LENGTH;
  if (w.trailCount < SIM.TRAIL_LENGTH) w.trailCount++;
}

function emit(w: World, kind: GameEventKind, x: number, y: number, data?: number): void {
  w.events.push({ kind, x, y, data });
}

/** Drain queued events (caller handles audio/haptics/fx), clearing the queue. */
export function drainEvents(w: World): GameEvent[] {
  if (w.events.length === 0) return EMPTY_EVENTS;
  const out = w.events;
  w.events = [];
  return out;
}
const EMPTY_EVENTS: GameEvent[] = [];
