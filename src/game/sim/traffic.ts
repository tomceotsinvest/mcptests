import { RoadClass } from '../types';
import type { CityMap, Vec } from '../types';
import { ROAD_SPEED } from '../constants';
import { dist, lerpVec } from '../util';

/**
 * Macroscopic congestion: a city-wide index (0 = free flow, 1 = gridlock)
 * from the time-of-day curve, weekday/weekend, weather, roadworks and the
 * simulated car mode share. Road class and bus lanes modulate how much a
 * given vehicle feels it.
 */
export function congestionIndex(
  minuteOfDay: number,
  weekend: boolean,
  weatherRoad: number,
  carShare: number,
  roadworks: number,
  congestionCharge: boolean,
): number {
  const h = minuteOfDay / 60;
  // Double-peaked weekday curve, single midday hump at weekends.
  let base: number;
  if (weekend) {
    base = 0.25 + 0.3 * Math.exp(-((h - 14) ** 2) / 18);
  } else {
    base =
      0.18 +
      0.55 * Math.exp(-((h - 8.5) ** 2) / 2.2) +
      0.6 * Math.exp(-((h - 17.7) ** 2) / 3.0) +
      0.15 * Math.exp(-((h - 13) ** 2) / 8);
  }
  let idx = base * (0.62 + 0.55 * carShare) * (2 - weatherRoad) + roadworks * 0.1;
  if (congestionCharge) idx *= 0.78;
  return Math.max(0.05, Math.min(1, idx));
}

/** Speed multiplier a road vehicle experiences at a congestion index. */
export function speedFactor(idx: number, cls: RoadClass, busLaneShare: number): number {
  const clsSensitivity: Record<RoadClass, number> = {
    [RoadClass.Motorway]: 0.9,
    [RoadClass.A]: 1.0,
    [RoadClass.B]: 0.85,
    [RoadClass.Residential]: 0.6,
    [RoadClass.Pedestrian]: 0,
  };
  const raw = 1 - 0.75 * idx * clsSensitivity[cls];
  // Bus lanes shield part of the delay on the share of the route that has them.
  return raw + (1 - raw) * 0.55 * busLaneShare;
}

/* ----------------------------------------------------- ambient road traffic
 * Cosmetic cars/taxis/vans/cyclists that wander the road graph so streets
 * feel alive. Their count scales with the congestion index; they carry no
 * gameplay state.
 */

export interface AmbientCar {
  p: Vec;
  heading: number;
  kind: number; // 0 car, 1 taxi, 2 van, 3 cyclist
  edge: number;
  fromNode: number;
  t: number; // 0..1 along edge
  speed: number;
}

export class AmbientTraffic {
  cars: AmbientCar[] = [];
  private target = 0;

  constructor(
    private map: CityMap,
    private rng: () => number,
  ) {}

  setLevel(congestion: number): void {
    this.target = Math.round(80 + congestion * 320);
  }

  update(gameDt: number, congestion: number): void {
    const map = this.map;
    while (this.cars.length < this.target) {
      const edge = Math.floor(this.rng() * map.edges.length);
      const e = map.edges[edge];
      if (e.cls === RoadClass.Pedestrian) continue;
      const kind = this.rng() < 0.12 ? 3 : this.rng() < 0.3 ? 1 : this.rng() < 0.45 ? 2 : 0;
      this.cars.push({
        p: { ...map.nodes[e.a].p },
        heading: 0,
        kind,
        edge,
        fromNode: e.a,
        t: this.rng(),
        speed: kind === 3 ? 4.5 : ROAD_SPEED[e.cls],
      });
    }
    if (this.cars.length > this.target) this.cars.length = this.target;

    const slow = 1 - 0.7 * congestion;
    for (const car of this.cars) {
      const e = map.edges[car.edge];
      const from = map.nodes[car.fromNode].p;
      const toNode = e.a === car.fromNode ? e.b : e.a;
      const to = map.nodes[toNode].p;
      const len = Math.max(1, e.len);
      car.t += ((car.kind === 3 ? car.speed : car.speed * slow) * gameDt) / len;
      if (car.t >= 1) {
        // pick a random onward drivable edge from toNode
        const adj = map.nodes[toNode].adj;
        let next = -1;
        for (let tries = 0; tries < 4; tries++) {
          const cand = adj[Math.floor(this.rng() * adj.length)];
          const ce = map.edges[cand];
          if (ce.cls === RoadClass.Pedestrian) continue;
          if (ce.oneWay && ce.a !== toNode) continue;
          if (cand === car.edge && adj.length > 1 && tries < 3) continue;
          next = cand;
          break;
        }
        if (next === -1) {
          car.t = 0; // bounce back
          car.fromNode = toNode;
          continue;
        }
        car.edge = next;
        car.fromNode = toNode;
        car.t = 0;
        car.speed = car.kind === 3 ? 4.5 : ROAD_SPEED[this.map.edges[next].cls];
      } else {
        car.p = lerpVec(from, to, car.t);
        car.heading = Math.atan2(to.y - from.y, to.x - from.x);
      }
    }
  }
}

/** Rough length-weighted bus-lane share of a route path (sampled). */
export function busLaneShare(map: CityMap, path: Vec[]): number {
  if (path.length < 2) return 0;
  // Sample a handful of path points and test nearby edges for bus lanes.
  let hits = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor(path.length / 24));
  for (let i = 0; i < path.length; i += step) {
    samples++;
    const p = path[i];
    let found = false;
    for (let eid = 0; eid < map.edges.length && !found; eid += 7) {
      const e = map.edges[eid];
      if (!e.busLane) continue;
      const a = map.nodes[e.a].p;
      if (Math.abs(a.x - p.x) < 120 && Math.abs(a.y - p.y) < 120) found = true;
    }
    if (found) hits++;
  }
  return samples ? hits / samples : 0;
}
