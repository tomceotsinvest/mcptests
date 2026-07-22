/**
 * entities.ts — plain mutable runtime types for every game object.
 *
 * These live in the loop, NOT in React state. They are pooled (§7), so every
 * type has a `reset`-friendly flat shape and an `alive`/`active` marker where
 * relevant. World coordinates are absolute; the camera maps them to screen.
 */

export type PlanetKind = 'normal' | 'rogue';

export interface Planet {
  x: number;
  y: number;
  r: number; // surface radius
  hue: number; // index into palette.planetHues
  kind: PlanetKind;
  pulse: number; // phase for the subtle breathing animation
  reached: boolean; // has the ship completed a slingshot off this one
  id: number;
}

export interface Dust {
  x: number;
  y: number;
  collected: boolean;
  twinkle: number; // phase offset
}

export type HazardKind = 'asteroid' | 'cloud' | 'wormhole';

export interface Hazard {
  x: number;
  y: number;
  r: number;
  kind: HazardKind;
  vx: number; // drift (asteroids)
  vy: number;
  linkX: number; // wormhole paired exit
  linkY: number;
  phase: number;
}

export type ShipMode = 'flight' | 'orbit';

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number; // facing angle (rad), derived from velocity/tangent
  mode: ShipMode;

  // orbit state (valid when mode === 'orbit')
  planet: Planet | null;
  radius: number;
  theta: number;
  omega: number;
  spinDir: 1 | -1;

  alive: boolean;
  invuln: number; // seconds of post-continue invulnerability
}

export function makeShip(): Ship {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    mode: 'flight',
    planet: null,
    radius: 0,
    theta: 0,
    omega: 0,
    spinDir: 1,
    alive: true,
    invuln: 0,
  };
}

export function makePlanet(): Planet {
  return { x: 0, y: 0, r: 30, hue: 0, kind: 'normal', pulse: 0, reached: false, id: 0 };
}

export function makeDust(): Dust {
  return { x: 0, y: 0, collected: false, twinkle: 0 };
}

export function makeHazard(): Hazard {
  return { x: 0, y: 0, r: 16, kind: 'asteroid', vx: 0, vy: 0, linkX: 0, linkY: 0, phase: 0 };
}
