import type { CityMap, Mode, Route, Stop, Vec, Vehicle } from '../types';
import { TRANSFER_RADIUS, ROUTE_COLORS, vehicleType } from '../constants';
import { cumulative, dist, pointAt, SpatialGrid } from '../util';
import { WORLD } from '../constants';
import { busLaneShare } from './traffic';

/** Edge kinds in the transit graph. */
export const EK_WALK = 0;
export const EK_BOARD = 1;
export const EK_RIDE = 2;
export const EK_ALIGHT = 3;

export interface TransitEdge {
  to: number;
  cost: number; // generalised minutes
  kind: number;
  route: number;
  sIdx: number; // stop index within route (board/ride source index)
  dir: 1 | -1;
}

export interface TransitGraph {
  nodeCount: number;
  stopCount: number;
  adj: TransitEdge[][];
}

/** Average value of time used to fold fares into planner minutes. */
const FARE_TO_MIN = 4.5; // £1 ≈ 4.5 perceived minutes

export interface BoardingHooks {
  /** agents waiting at a stop who want (route,dir) — returns agent ids to board */
  collectBoarders(stopId: number, routeId: number, dir: 1 | -1, space: number): number[];
  /** does this rider's current leg end at this stop of this route? */
  shouldAlight(agentId: number, routeId: number, stopIdx: number): boolean;
  /** agent finished a ride leg at this stop */
  onAlight(agentId: number, stopId: number): void;
  /** fare charged per boarding */
  onBoard(agentId: number, routeId: number, mode: Mode): void;
}

export class Network {
  stops: (Stop | null)[] = [];
  routes: (Route | null)[] = [];
  vehicles = new Map<number, Vehicle>();
  private nextVehicleId = 1;
  stopGrid: SpatialGrid;
  graph: TransitGraph | null = null;
  graphDirty = true;
  /** per-route bus lane share cache */
  private laneShare = new Map<number, number>();
  /** vehicle-km accumulated since last economy settlement, by vehicle type */
  kmByType = new Map<string, number>();

  laneShareOf(routeId: number): number {
    return this.laneShare.get(routeId) ?? 0;
  }

  constructor(public map: CityMap) {
    this.stopGrid = new SpatialGrid(TRANSFER_RADIUS, WORLD.minX, WORLD.minY);
  }

  /* ------------------------------------------------------------- stops */

  addStop(mode: Mode, p: Vec, nodeId: number, name: string, legacy = false): Stop {
    const stop: Stop = {
      id: this.stops.length,
      mode,
      p: { ...p },
      nodeId,
      name,
      routes: [],
      closedUntil: 0,
      legacy,
    };
    this.stops.push(stop);
    this.stopGrid.insert(p.x, p.y, stop.id);
    this.graphDirty = true;
    return stop;
  }

  removeStop(id: number): boolean {
    const s = this.stops[id];
    if (!s || s.routes.length > 0) return false;
    this.stops[id] = null;
    this.rebuildStopGrid();
    this.graphDirty = true;
    return true;
  }

  rebuildStopGrid(): void {
    this.stopGrid.clear();
    for (const s of this.stops) if (s) this.stopGrid.insert(s.p.x, s.p.y, s.id);
  }

  stopsNear(p: Vec, radius: number, out: number[]): number[] {
    this.stopGrid.query(p.x, p.y, radius, out);
    let n = 0;
    for (const id of out) {
      const s = this.stops[id];
      if (s && dist(s.p, p) <= radius) out[n++] = id;
    }
    out.length = n;
    return out;
  }

  /* ------------------------------------------------------------ routes */

  createRoute(
    mode: Mode,
    name: string,
    stopIds: number[],
    path: Vec[],
    circular: boolean,
    vehicleTypeId: string,
  ): Route {
    const id = this.routes.length;
    const cum = cumulative(path);
    const route: Route = {
      id,
      mode,
      name,
      color: ROUTE_COLORS[id % ROUTE_COLORS.length],
      stops: stopIds,
      path,
      cum,
      stopPathIdx: stopIds.map((sid, k) => this.nearestPathIdx(path, this.stops[sid]!.p, k, stopIds.length, circular)),
      circular,
      vehicleType: vehicleTypeId,
      vehiclesTarget: 0,
      active: true,
      slowUntil: 0,
      slowFactor: 1,
      boardingsToday: 0,
      boardingsYesterday: 0,
      crowding: 0,
      legacy: false,
    };
    this.routes.push(route);
    for (const sid of stopIds) {
      const s = this.stops[sid]!;
      if (!s.routes.includes(id)) s.routes.push(id);
    }
    this.laneShare.set(id, mode === 'bus' || mode === 'tram' ? busLaneShare(this.map, path) : 0);
    this.graphDirty = true;
    return route;
  }

  /** stop's index into path — nearest vertex, monotonic-ish per stop order */
  private nearestPathIdx(path: Vec[], p: Vec, k: number, nStops: number, circular: boolean): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = dist(path[i], p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  deleteRoute(id: number): void {
    const r = this.routes[id];
    if (!r) return;
    for (const sid of r.stops) {
      const s = this.stops[sid];
      if (s) s.routes = s.routes.filter((x) => x !== id);
    }
    for (const [vid, v] of [...this.vehicles]) {
      if (v.routeId === id) this.vehicles.delete(vid);
    }
    this.routes[id] = null;
    this.graphDirty = true;
  }

  routeLength(r: Route): number {
    return r.cum[r.cum.length - 1] ?? 0;
  }

  /** Round-trip time in minutes at planning speed (for headway estimates). */
  cycleMinutes(r: Route): number {
    const vt = vehicleType(r.vehicleType);
    const len = this.routeLength(r) * (r.circular ? 1 : 2);
    const driveMin = len / (vt.speed * 0.72) / 60;
    const dwellMin = (r.stops.length * (r.circular ? 1 : 2) * 25) / 60;
    return driveMin + dwellMin;
  }

  headwayMinutes(r: Route): number {
    if (r.vehiclesTarget <= 0) return Infinity;
    return this.cycleMinutes(r) / r.vehiclesTarget;
  }

  /* ---------------------------------------------------------- vehicles */

  /** Ensure the fleet matches each route's target; returns net purchase cost. */
  syncFleets(): number {
    let spend = 0;
    for (const r of this.routes) {
      if (!r) continue;
      const owned: Vehicle[] = [];
      for (const v of this.vehicles.values()) if (v.routeId === r.id) owned.push(v);
      const vt = vehicleType(r.vehicleType);
      if (owned.length < r.vehiclesTarget) {
        const total = this.routeLength(r);
        for (let i = owned.length; i < r.vehiclesTarget; i++) {
          const s = (total * i) / r.vehiclesTarget;
          const v: Vehicle = {
            id: this.nextVehicleId++,
            routeId: r.id,
            dir: 1,
            s,
            state: 'run',
            dwell: 0,
            nextStopIdx: 0,
            passengers: [],
            p: { ...r.path[0] },
            heading: 0,
            occupancy: 0,
          };
          this.advanceNextStop(v, r);
          this.vehicles.set(v.id, v);
          spend += vt.price;
        }
      } else if (owned.length > r.vehiclesTarget) {
        // Sell surplus (half price back) — prefer empty vehicles.
        owned.sort((a, b) => a.passengers.length - b.passengers.length);
        for (let i = r.vehiclesTarget; i < owned.length; i++) {
          if (owned[i].passengers.length > 0) continue; // keep until empty
          this.vehicles.delete(owned[i].id);
          spend -= vt.price * 0.5;
        }
      }
    }
    return spend;
  }

  private advanceNextStop(v: Vehicle, r: Route): void {
    // find the first stop strictly ahead of v.s in direction of travel
    if (v.dir === 1) {
      v.nextStopIdx = 0;
      for (let k = 0; k < r.stops.length; k++) {
        if (r.cum[r.stopPathIdx[k]] > v.s + 1) {
          v.nextStopIdx = k;
          return;
        }
      }
      v.nextStopIdx = r.circular ? 0 : r.stops.length - 1;
    } else {
      v.nextStopIdx = r.stops.length - 1;
      for (let k = r.stops.length - 1; k >= 0; k--) {
        if (r.cum[r.stopPathIdx[k]] < v.s - 1) {
          v.nextStopIdx = k;
          return;
        }
      }
      v.nextStopIdx = 0;
    }
  }

  /**
   * Move all vehicles for gameDt seconds; handle dwell, boarding, alighting.
   * congestionFor(route) returns a 0..x speed multiplier.
   */
  step(gameDt: number, minute: number, hooks: BoardingHooks, congestionFor: (r: Route) => number): void {
    for (const v of this.vehicles.values()) {
      const r = this.routes[v.routeId];
      if (!r || !r.active) continue;
      const vt = vehicleType(r.vehicleType);
      if (v.state === 'dwell') {
        v.dwell -= gameDt;
        if (v.dwell > 0) continue;
        v.state = 'run';
        this.stepNextStop(v, r);
      }
      const speed = vt.speed * congestionFor(r) * (minute < r.slowUntil ? r.slowFactor : 1);
      const moved = speed * gameDt;
      v.s += moved * v.dir;
      this.kmByType.set(vt.id, (this.kmByType.get(vt.id) ?? 0) + moved / 1000);
      const total = this.routeLength(r);

      if (r.circular) {
        if (v.s >= total) v.s -= total;
        if (v.s < 0) v.s += total;
      } else {
        if (v.s >= total) {
          v.s = total;
          v.dir = -1;
        } else if (v.s <= 0) {
          v.s = 0;
          v.dir = 1;
        }
      }

      // Arrived at next stop?
      const targetS = r.cum[r.stopPathIdx[v.nextStopIdx]];
      const arrived = v.dir === 1 ? v.s >= targetS : v.s <= targetS;
      if (arrived && r.stops.length > 0) {
        v.s = targetS;
        this.serveStop(v, r, minute, hooks, vt.capacity);
      }

      const at = pointAt(r.path, r.cum, v.s);
      v.p = at.p;
      v.heading = v.dir === 1 ? at.heading : at.heading + Math.PI;
      v.occupancy = v.passengers.length / vt.capacity;
    }
  }

  private stepNextStop(v: Vehicle, r: Route): void {
    const n = r.stops.length;
    if (r.circular) {
      v.nextStopIdx = (v.nextStopIdx + 1) % n;
      return;
    }
    if (v.dir === 1) {
      if (v.nextStopIdx + 1 < n) v.nextStopIdx++;
      else {
        v.dir = -1;
        v.nextStopIdx = n - 2 >= 0 ? n - 2 : 0;
      }
    } else {
      if (v.nextStopIdx - 1 >= 0) v.nextStopIdx--;
      else {
        v.dir = 1;
        v.nextStopIdx = n > 1 ? 1 : 0;
      }
    }
  }

  private serveStop(v: Vehicle, r: Route, minute: number, hooks: BoardingHooks, capacity: number): void {
    const stopIdx = v.nextStopIdx;
    const stopId = r.stops[stopIdx];
    const stop = this.stops[stopId];
    const closed = stop ? stop.closedUntil > minute : false;

    let moved = 0;
    if (!closed) {
      // Alight
      for (let i = v.passengers.length - 1; i >= 0; i--) {
        const agentId = v.passengers[i];
        if (hooks.shouldAlight(agentId, r.id, stopIdx)) {
          v.passengers.splice(i, 1);
          hooks.onAlight(agentId, stopId);
          moved++;
        }
      }
      // Board
      const space = capacity - v.passengers.length;
      if (space > 0) {
        const boarders = hooks.collectBoarders(stopId, r.id, v.dir, space);
        for (const agentId of boarders) {
          v.passengers.push(agentId);
          hooks.onBoard(agentId, r.id, r.mode);
          r.boardingsToday++;
          moved++;
        }
      }
    }
    v.state = 'dwell';
    const base = r.mode === 'tube' ? 25 : r.mode === 'boat' ? 60 : 14;
    v.dwell = base + moved * 1.1;
    // crowding EMA for the planner
    r.crowding = r.crowding * 0.98 + (v.passengers.length / capacity) * 0.02;
  }

  /* ----------------------------------------------------- transit graph */

  buildGraph(fares: { bus: number; tram: number; tube: number; boat: number }): TransitGraph {
    const stopCount = this.stops.length;
    const adj: TransitEdge[][] = [];
    let nodeCount = stopCount;
    for (let i = 0; i < stopCount; i++) adj.push([]);

    // Walk transfers between nearby stops.
    const scratch: number[] = [];
    for (let i = 0; i < stopCount; i++) {
      const s = this.stops[i];
      if (!s) continue;
      this.stopsNear(s.p, TRANSFER_RADIUS, scratch);
      for (const j of scratch) {
        if (j === i) continue;
        const t = this.stops[j]!;
        const d = dist(s.p, t.p);
        adj[i].push({ to: j, cost: d / 1.3 / 60 + 1.6, kind: EK_WALK, route: -1, sIdx: -1, dir: 1 });
      }
    }

    // Route chains.
    for (const r of this.routes) {
      if (!r || !r.active || r.stops.length < 2) continue;
      const headway = this.headwayMinutes(r);
      if (!isFinite(headway)) continue;
      const wait = Math.min(16, Math.max(0.5, headway / 2));
      const vt = vehicleType(r.vehicleType);
      const speedEst = vt.speed * 0.68;
      const crowdPenalty = Math.max(0, r.crowding - 0.55) * 9;
      // Fares fold into board edges at an average value of time; individual
      // agents additionally weigh totals with their own preferences.
      const fareMin = fares[r.mode] * FARE_TO_MIN;

      const dirs: (1 | -1)[] = r.circular ? [1] : [1, -1];
      for (const dir of dirs) {
        const base = nodeCount;
        const n = r.stops.length;
        nodeCount += n;
        for (let k = 0; k < n; k++) adj.push([]);
        for (let k = 0; k < n; k++) {
          const stopOrder = dir === 1 ? k : n - 1 - k;
          const stopId = r.stops[stopOrder];
          const stop = this.stops[stopId];
          if (!stop) continue;
          // board
          adj[stopId].push({
            to: base + k,
            cost: wait + crowdPenalty + fareMin,
            kind: EK_BOARD,
            route: r.id,
            sIdx: stopOrder,
            dir,
          });
          // alight
          adj[base + k].push({ to: stopId, cost: 0.6, kind: EK_ALIGHT, route: r.id, sIdx: stopOrder, dir });
          // ride to next
          const nextK = k + 1;
          if (nextK < n || r.circular) {
            const kk = nextK % n;
            const fromOrder = stopOrder;
            const toOrder = dir === 1 ? kk : n - 1 - kk;
            let d: number;
            const total = this.routeLength(r);
            const sA = r.cum[r.stopPathIdx[fromOrder]];
            const sB = r.cum[r.stopPathIdx[toOrder]];
            if (dir === 1) d = sB >= sA ? sB - sA : total - sA + sB;
            else d = sA >= sB ? sA - sB : sA + (total - sB);
            if (nextK < n || r.circular) {
              adj[base + k].push({
                to: base + (kk === 0 && r.circular ? 0 : nextK < n ? nextK : 0),
                cost: d / speedEst / 60 + 0.45,
                kind: EK_RIDE,
                route: r.id,
                sIdx: stopOrder,
                dir,
              });
            }
          }
        }
      }
    }

    this.graph = { nodeCount, stopCount, adj };
    this.graphDirty = false;
    return this.graph;
  }

  ensureGraph(fares: { bus: number; tram: number; tube: number; boat: number }): TransitGraph {
    if (this.graphDirty || !this.graph) return this.buildGraph(fares);
    return this.graph;
  }

  fareToMinutes(fare: number): number {
    return fare * FARE_TO_MIN;
  }
}
