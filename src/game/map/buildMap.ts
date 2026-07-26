import { RoadClass } from '../types';
import type { CityMap, RoadEdge, RoadNode, Vec, Zone } from '../types';
import { WORLD, ZONE_SIZE } from '../constants';
import {
  cumulative,
  dist,
  distToPolyline,
  makeRng,
  pointInPoly,
  projectOnPolyline,
  resample,
  segCrossesPolyline,
  segIntersect,
  SpatialGrid,
} from '../util';
import { AUTHORED_ROADS } from './authoredRoads';
import {
  BOROUGH_LINES,
  JOB_CENTRES,
  LANDMARKS,
  PARKS,
  PIER_DEFS,
  RAIL_LINES,
  RES_CENTRES,
  TERMINI,
  THAMES,
  THAMES_WIDTH,
} from './features';
import { TUBE_LINES, TUBE_STATIONS } from './tubeData';

/** Vertex spacing on arterials after resampling, metres. */
const ARTERIAL_SPACING = 95;
/** Residential lattice spacing, metres. */
const GRID_SPACING = 175;
/** Grid points closer than this to an arterial node merge onto it. */
const SNAP_DIST = 95;

/**
 * Build the entire static world for a seed. Deterministic: saves only store
 * the seed and player infrastructure.
 */
export function buildMap(seed: number): CityMap {
  const rng = makeRng(seed ^ 0x5eed);
  const thamesCum = cumulative(THAMES);

  /* -- 1. resample authored arterials ---------------------------------- */
  const roads = AUTHORED_ROADS.map((r) => ({
    ...r,
    pts: resample(r.pts, ARTERIAL_SPACING),
  }));

  /* -- 2. split arterials at mutual intersections ---------------------- */
  // Collect segments into a coarse hash to prune pairs.
  interface Seg {
    road: number;
    idx: number; // segment i: pts[i] -> pts[i+1]
  }
  const segGrid = new Map<number, Seg[]>();
  const CELL = 260;
  const cellKey = (x: number, y: number) =>
    Math.floor((x - WORLD.minX) / CELL) * 4001 + Math.floor((y - WORLD.minY) / CELL);
  const addSeg = (s: Seg, a: Vec, b: Vec) => {
    const keys = new Set([cellKey(a.x, a.y), cellKey(b.x, b.y), cellKey((a.x + b.x) / 2, (a.y + b.y) / 2)]);
    for (const k of keys) {
      const arr = segGrid.get(k);
      if (arr) arr.push(s);
      else segGrid.set(k, [s]);
    }
  };
  roads.forEach((r, ri) => {
    for (let i = 0; i < r.pts.length - 1; i++) addSeg({ road: ri, idx: i }, r.pts[i], r.pts[i + 1]);
  });

  // splits[roadIdx] -> list of {idx, t, p}
  const splits: { idx: number; t: number; p: Vec }[][] = roads.map(() => []);
  const seen = new Set<string>();
  for (const segs of segGrid.values()) {
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const s1 = segs[i];
        const s2 = segs[j];
        if (s1.road === s2.road) continue;
        const key = `${s1.road}:${s1.idx}:${s2.road}:${s2.idx}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = roads[s1.road].pts[s1.idx];
        const b = roads[s1.road].pts[s1.idx + 1];
        const c = roads[s2.road].pts[s2.idx];
        const d = roads[s2.road].pts[s2.idx + 1];
        const hit = segIntersect(a, b, c, d);
        if (!hit) continue;
        const p = { x: a.x + (b.x - a.x) * hit.t, y: a.y + (b.y - a.y) * hit.t };
        splits[s1.road].push({ idx: s1.idx, t: hit.t, p });
        splits[s2.road].push({ idx: s2.idx, t: hit.u, p });
      }
    }
  }
  for (let ri = 0; ri < roads.length; ri++) {
    if (!splits[ri].length) continue;
    const list = splits[ri].sort((x, y) => x.idx - y.idx || x.t - y.t);
    const pts = roads[ri].pts;
    const out: Vec[] = [];
    let li = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      out.push(pts[i]);
      while (li < list.length && list[li].idx === i) {
        out.push(list[li].p);
        li++;
      }
    }
    out.push(pts[pts.length - 1]);
    roads[ri].pts = out;
  }

  /* -- 3. node registry + arterial edges ------------------------------- */
  const nodes: RoadNode[] = [];
  const edges: RoadEdge[] = [];
  const nodeKey = new Map<string, number>();
  const nodeAt = (p: Vec): number => {
    const k = `${Math.round(p.x / 4)}:${Math.round(p.y / 4)}`;
    const existing = nodeKey.get(k);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({ p: { x: p.x, y: p.y }, adj: [] });
    nodeKey.set(k, id);
    return id;
  };
  const addEdge = (
    a: number,
    b: number,
    cls: RoadClass,
    opts: { oneWay?: boolean; busLane?: boolean; bridge?: boolean; name?: string },
  ) => {
    if (a === b) return;
    const len = dist(nodes[a].p, nodes[b].p);
    if (len < 1) return;
    const id = edges.length;
    edges.push({
      a,
      b,
      cls,
      len,
      oneWay: !!opts.oneWay,
      busLane: !!opts.busLane,
      bridge: !!opts.bridge,
      name: opts.name,
    });
    nodes[a].adj.push(id);
    nodes[b].adj.push(id);
  };

  for (const r of roads) {
    let prev = nodeAt(r.pts[0]);
    for (let i = 1; i < r.pts.length; i++) {
      const cur = nodeAt(r.pts[i]);
      addEdge(prev, cur, r.cls, { oneWay: r.oneWay, busLane: r.busLane, bridge: r.bridge, name: r.name });
      prev = cur;
    }
  }
  const arterialNodeCount = nodes.length;

  // Spatial index of arterial nodes for snapping.
  const artGrid = new SpatialGrid(SNAP_DIST * 2, WORLD.minX, WORLD.minY);
  for (let i = 0; i < arterialNodeCount; i++) artGrid.insert(nodes[i].p.x, nodes[i].p.y, i);
  const scratch: number[] = [];

  const inWater = (p: Vec) => distToPolyline(p, THAMES) < THAMES_WIDTH / 2 + 30;
  const inPark = (p: Vec) => PARKS.some((park) => pointInPoly(p, park.poly));

  /* -- 4. residential lattice ------------------------------------------ */
  const cols = Math.floor((WORLD.maxX - WORLD.minX) / GRID_SPACING);
  const rows = Math.floor((WORLD.maxY - WORLD.minY) / GRID_SPACING);
  const latticeIds: Int32Array = new Int32Array(cols * rows).fill(-1);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      // Small hole probability keeps the grid organic.
      if (rng() < 0.06) continue;
      const p: Vec = {
        x: WORLD.minX + (gx + 0.5) * GRID_SPACING + (rng() - 0.5) * 70,
        y: WORLD.minY + (gy + 0.5) * GRID_SPACING + (rng() - 0.5) * 70,
      };
      if (inWater(p) || inPark(p)) continue;
      // Snap onto a nearby arterial node so the networks weld together.
      let snapped = -1;
      let best = SNAP_DIST;
      artGrid.query(p.x, p.y, SNAP_DIST, scratch);
      for (const id of scratch) {
        const d = dist(p, nodes[id].p);
        if (d < best) {
          best = d;
          snapped = id;
        }
      }
      latticeIds[gy * cols + gx] = snapped >= 0 ? snapped : nodeAt(p);
    }
  }
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const a = latticeIds[gy * cols + gx];
      if (a < 0) continue;
      const tryLink = (b: number) => {
        if (b < 0 || b === a) return;
        const pa = nodes[a].p;
        const pb = nodes[b].p;
        if (dist(pa, pb) > GRID_SPACING * 1.9) return;
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        if (inWater(mid) || inPark(mid)) return;
        if (segCrossesPolyline(pa, pb, THAMES)) return;
        addEdge(a, b, RoadClass.Residential, {});
      };
      if (gx + 1 < cols) tryLink(latticeIds[gy * cols + gx + 1]);
      if (gy + 1 < rows) tryLink(latticeIds[(gy + 1) * cols + gx]);
    }
  }

  /* -- 5. demand zones -------------------------------------------------- */
  const zonesW = Math.ceil((WORLD.maxX - WORLD.minX) / ZONE_SIZE);
  const zonesH = Math.ceil((WORLD.maxY - WORLD.minY) / ZONE_SIZE);
  const zones: Zone[] = [];
  const blob = (p: Vec, c: Vec, sigma: number, w: number) => {
    const d2 = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    return w * Math.exp(-d2 / (2 * sigma * sigma));
  };
  for (let zy = 0; zy < zonesH; zy++) {
    for (let zx = 0; zx < zonesW; zx++) {
      const cx = WORLD.minX + (zx + 0.5) * ZONE_SIZE;
      const cy = WORLD.minY + (zy + 0.5) * ZONE_SIZE;
      const p = { x: cx, y: cy };
      let res = 0.25 + rng() * 0.2;
      let jobs = 0.05 + rng() * 0.1;
      let attract = 0.02;
      if (inWater(p)) {
        res = jobs = attract = 0;
      } else {
        for (const c of JOB_CENTRES) jobs += blob(p, c.p, c.sigma, c.w);
        for (const c of RES_CENTRES) res += blob(p, c.p, c.sigma, c.w);
        for (const t of TERMINI) res += blob(p, t.p, 260, 4); // commuter inflow
        for (const l of LANDMARKS) attract += blob(p, l.p, 350, l.weight);
        if (inPark(p)) {
          res *= 0.05;
          jobs *= 0.05;
          attract += 0.5;
        }
      }
      zones.push({ cx, cy, res, jobs, attract });
    }
  }

  /* -- 6. piers along the Thames ---------------------------------------- */
  const piers = PIER_DEFS.map((pd) => {
    const proj = projectOnPolyline(pd.p, THAMES, thamesCum);
    return { name: pd.name, p: proj.p, s: proj.s };
  });

  return {
    bounds: { ...WORLD },
    nodes,
    edges,
    thames: THAMES,
    thamesCum,
    thamesWidth: THAMES_WIDTH,
    parks: PARKS,
    landmarks: LANDMARKS,
    piers,
    rail: RAIL_LINES,
    boroughs: BOROUGH_LINES,
    tubeStations: TUBE_STATIONS,
    tubeLines: TUBE_LINES,
    zones,
    zoneSize: ZONE_SIZE,
    zonesW,
    zonesH,
  };
}

/* ------------------------------------------------------- road pathfinding */

/**
 * Dijkstra over the road graph between two nodes, respecting one-way
 * streets and excluding pedestrian-only edges. Used by the route editor to
 * snap bus/tram routes onto streets. Returns node ids, or null.
 */
export function roadPath(map: CityMap, from: number, to: number): number[] | null {
  const n = map.nodes.length;
  const distArr = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new (class {
    ids: number[] = [];
    costs: number[] = [];
    push(id: number, c: number) {
      this.ids.push(id);
      this.costs.push(c);
      let i = this.ids.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.costs[p] <= this.costs[i]) break;
        [this.ids[i], this.ids[p]] = [this.ids[p], this.ids[i]];
        [this.costs[i], this.costs[p]] = [this.costs[p], this.costs[i]];
        i = p;
      }
    }
    pop(): [number, number] | null {
      if (!this.ids.length) return null;
      const top: [number, number] = [this.ids[0], this.costs[0]];
      const li = this.ids.pop()!;
      const lc = this.costs.pop()!;
      if (this.ids.length) {
        this.ids[0] = li;
        this.costs[0] = lc;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < this.ids.length && this.costs[l] < this.costs[m]) m = l;
          if (r < this.ids.length && this.costs[r] < this.costs[m]) m = r;
          if (m === i) break;
          [this.ids[i], this.ids[m]] = [this.ids[m], this.ids[i]];
          [this.costs[i], this.costs[m]] = [this.costs[m], this.costs[i]];
          i = m;
        }
      }
      return top;
    }
  })();

  distArr[from] = 0;
  heap.push(from, 0);
  // Slight preference for bigger roads so buses stay on sensible streets.
  const classWeight: Record<RoadClass, number> = {
    [RoadClass.Motorway]: 0.8,
    [RoadClass.A]: 0.9,
    [RoadClass.B]: 1.0,
    [RoadClass.Residential]: 1.35,
    [RoadClass.Pedestrian]: 1e9,
  };
  for (;;) {
    const top = heap.pop();
    if (!top) break;
    const [u, c] = top;
    if (c > distArr[u]) continue;
    if (u === to) break;
    for (const eid of map.nodes[u].adj) {
      const e = map.edges[eid];
      if (e.cls === RoadClass.Pedestrian) continue;
      let v: number;
      if (e.a === u) v = e.b;
      else if (!e.oneWay) v = e.a;
      else continue; // one-way against us
      const nc = c + e.len * classWeight[e.cls];
      if (nc < distArr[v]) {
        distArr[v] = nc;
        prev[v] = u;
        heap.push(v, nc);
      }
    }
  }
  if (!isFinite(distArr[to])) return null;
  const path: number[] = [];
  for (let u = to; u !== -1; u = prev[u]) path.push(u);
  path.reverse();
  return path;
}

/** Nearest non-pedestrian road node to a world point (for stop placement). */
export function nearestRoadNode(map: CityMap, grid: SpatialGrid, p: Vec, radius: number): number {
  const out: number[] = [];
  grid.query(p.x, p.y, radius, out);
  let best = -1;
  let bestD = radius;
  for (const id of out) {
    const node = map.nodes[id];
    // must touch at least one drivable edge
    let drivable = false;
    for (const eid of node.adj) {
      if (map.edges[eid].cls !== RoadClass.Pedestrian) {
        drivable = true;
        break;
      }
    }
    if (!drivable) continue;
    const d = dist(p, node.p);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** Build a spatial grid over all road nodes. */
export function buildNodeGrid(map: CityMap): SpatialGrid {
  const grid = new SpatialGrid(200, WORLD.minX, WORLD.minY);
  for (let i = 0; i < map.nodes.length; i++) grid.insert(map.nodes[i].p.x, map.nodes[i].p.y, i);
  return grid;
}
