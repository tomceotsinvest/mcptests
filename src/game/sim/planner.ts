import type { Agent, Leg, RideLeg, Vec } from '../types';
import { ACCESS_RADIUS, WALK_ONLY_MAX } from '../constants';
import { dist, MinHeap } from '../util';
import { EK_ALIGHT, EK_BOARD, EK_RIDE, EK_WALK, Network, TransitGraph } from './network';

export interface PlanResult {
  legs: Leg[];
  /** expected total minutes */
  minutes: number;
  usesTransit: boolean;
}

/**
 * Plan a door-to-door journey. Multi-source Dijkstra over the transit graph
 * seeded with all stops within walking range of the origin; finishes at any
 * stop within walking range of the destination. The transit plan competes
 * against simply walking.
 */
export function planJourney(
  net: Network,
  graph: TransitGraph,
  origin: Vec,
  dest: Vec,
  walkSpeed: number,
  maxWalk: number,
  minute: number,
): PlanResult | null {
  const walkMinPerM = 1 / walkSpeed / 60;
  const directDist = dist(origin, dest);
  const walkOnlyMin = directDist * walkMinPerM;

  // Gather access/egress stops.
  const scratch: number[] = [];
  const accessRadius = Math.min(maxWalk, ACCESS_RADIUS);
  const originStops = net.stopsNear(origin, accessRadius, [...scratch]);
  const destStops = net.stopsNear(dest, accessRadius, []);

  let best: { node: number; total: number } | null = null;
  let legs: Leg[] | null = null;

  if (originStops.length && destStops.length) {
    const egress = new Map<number, number>(); // stopId -> walk minutes to dest
    for (const sid of destStops) {
      const s = net.stops[sid];
      if (!s || s.closedUntil > minute) continue;
      egress.set(sid, dist(s.p, dest) * walkMinPerM);
    }

    const n = graph.nodeCount;
    const costArr = new Float64Array(n).fill(Infinity);
    const prevNode = new Int32Array(n).fill(-1);
    const prevEdge = new Int32Array(n).fill(-1); // index into adj[prevNode]
    const heap = new MinHeap();

    for (const sid of originStops) {
      const s = net.stops[sid];
      if (!s || s.closedUntil > minute) continue;
      const c = dist(s.p, origin) * walkMinPerM;
      if (c < costArr[sid]) {
        costArr[sid] = c;
        heap.push(sid, c);
      }
    }

    let bestTotal = Infinity;
    let bestNode = -1;
    for (;;) {
      const top = heap.pop();
      if (!top) break;
      const { id: u, cost: c } = top;
      if (c > costArr[u]) continue;
      if (c >= bestTotal) break; // cannot improve
      const eg = u < graph.stopCount ? egress.get(u) : undefined;
      if (eg !== undefined && c + eg < bestTotal) {
        bestTotal = c + eg;
        bestNode = u;
      }
      const edgesU = graph.adj[u];
      for (let ei = 0; ei < edgesU.length; ei++) {
        const e = edgesU[ei];
        // skip closed stops on boarding/walking targets
        if (e.to < graph.stopCount) {
          const st = net.stops[e.to];
          if (!st || st.closedUntil > minute) continue;
        }
        const nc = c + e.cost;
        if (nc < costArr[e.to]) {
          costArr[e.to] = nc;
          prevNode[e.to] = u;
          prevEdge[e.to] = ei;
          heap.push(e.to, nc);
        }
      }
    }

    if (bestNode >= 0 && isFinite(bestTotal)) {
      best = { node: bestNode, total: bestTotal };
      legs = reconstruct(net, graph, prevNode, prevEdge, bestNode, origin, dest);
    }
  }

  const transitOk = best && legs && legs.some((l) => l.kind === 'ride');
  // Choose transit when it beats walking (with a mild bias for transit
  // comfort on long trips) or walking is out of range.
  if (transitOk && best && legs && (best.total < walkOnlyMin * 0.92 || directDist > maxWalk * 2.2)) {
    return { legs, minutes: best.total, usesTransit: true };
  }
  if (directDist <= Math.min(WALK_ONLY_MAX, maxWalk * 3.2)) {
    return {
      legs: [{ kind: 'walk', from: { ...origin }, to: { ...dest } }],
      minutes: walkOnlyMin,
      usesTransit: false,
    };
  }
  return null; // no acceptable option — the agent will drive instead
}

/** Rebuild legs from Dijkstra parents; merges ride chains into single legs. */
function reconstruct(
  net: Network,
  graph: TransitGraph,
  prevNode: Int32Array,
  prevEdge: Int32Array,
  endNode: number,
  origin: Vec,
  dest: Vec,
): Leg[] {
  // Walk the parent chain backwards collecting edges.
  const chain: { from: number; edgeIdx: number; to: number }[] = [];
  let u = endNode;
  while (prevNode[u] !== -1) {
    chain.push({ from: prevNode[u], edgeIdx: prevEdge[u], to: u });
    u = prevNode[u];
  }
  chain.reverse();
  const firstStop = u; // seeded origin stop

  const legs: Leg[] = [];
  const firstStopDef = net.stops[firstStop];
  if (firstStopDef) legs.push({ kind: 'walk', from: { ...origin }, to: { ...firstStopDef.p } });

  let currentRide: RideLeg | null = null;
  for (const link of chain) {
    const e = graph.adj[link.from][link.edgeIdx];
    if (e.kind === EK_BOARD) {
      currentRide = {
        kind: 'ride',
        routeId: e.route,
        dir: e.dir,
        boardStop: net.routes[e.route]!.stops[e.sIdx],
        alightStop: -1,
        boardIdx: e.sIdx,
        alightIdx: -1,
      };
    } else if (e.kind === EK_RIDE) {
      // stays within the same route chain; nothing to do until alight
    } else if (e.kind === EK_ALIGHT) {
      if (currentRide) {
        currentRide.alightIdx = e.sIdx;
        currentRide.alightStop = net.routes[e.route]!.stops[e.sIdx];
        if (currentRide.alightIdx !== currentRide.boardIdx) legs.push(currentRide);
        currentRide = null;
      }
    } else if (e.kind === EK_WALK) {
      const a = net.stops[link.from];
      const b = net.stops[link.to];
      if (a && b) legs.push({ kind: 'walk', from: { ...a.p }, to: { ...b.p } });
    }
  }
  const lastStopDef = net.stops[endNode];
  if (lastStopDef) legs.push({ kind: 'walk', from: { ...lastStopDef.p }, to: { ...dest } });

  // Drop degenerate rides that got filtered (board==alight) leaving double walks.
  return legs.filter((l) => l.kind !== 'walk' || dist(l.from, l.to) > 1);
}

/** Replan the remainder of a journey from the agent's current position. */
export function replan(net: Network, graph: TransitGraph, agent: Agent, minute: number): boolean {
  const res = planJourney(net, graph, agent.p, agent.dest, agent.walkSpeed, agent.maxWalk, minute);
  if (!res) return false;
  agent.legs = res.legs;
  agent.legIdx = 0;
  agent.walkS = 0;
  agent.waitMin = 0;
  agent.replanned = true;
  return true;
}
