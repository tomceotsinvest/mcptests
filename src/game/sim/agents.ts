import type { Agent, CityMap, Purpose, Vec } from '../types';
import { DAILY_TRIPS_BASE, MAX_ACTIVE_AGENTS, MIN_PER_DAY } from '../constants';
import { dist, lognormal, makeRng } from '../util';
import { Network } from './network';
import { planJourney, replan } from './planner';

/**
 * Demand generation + passenger lifecycle.
 *
 * Trips spawn from a Poisson process whose rate follows time-of-day,
 * weekday/weekend and weather curves. Origin/destination are sampled from
 * the zone grid by purpose, so demand emerges from the geography.
 */

/** Normalised time-of-day trip profile (per-minute weight, sums ~1 over day). */
function todProfile(minuteOfDay: number, weekend: boolean): number {
  const h = minuteOfDay / 60;
  let w: number;
  if (weekend) {
    w =
      0.25 +
      1.1 * Math.exp(-((h - 12.5) ** 2) / 14) +
      0.9 * Math.exp(-((h - 19.5) ** 2) / 8) +
      0.1 * Math.exp(-((h - 23.5) ** 2) / 2);
  } else {
    w =
      0.12 +
      2.4 * Math.exp(-((h - 8.3) ** 2) / 1.6) +
      0.8 * Math.exp(-((h - 12.8) ** 2) / 3.5) +
      2.2 * Math.exp(-((h - 17.8) ** 2) / 2.4) +
      0.5 * Math.exp(-((h - 21.5) ** 2) / 4);
  }
  return w / (weekend ? 1180 : 1560); // approx normalisers → sums to ~1/day
}

function pickPurpose(minuteOfDay: number, weekend: boolean, rng: () => number): Purpose {
  const h = minuteOfDay / 60;
  const r = rng();
  if (!weekend) {
    if (h >= 6 && h < 10.5) return r < 0.72 ? 'commute' : r < 0.82 ? 'school' : 'shop';
    if (h >= 15.5 && h < 20) return r < 0.62 ? 'return' : r < 0.82 ? 'leisure' : 'shop';
    if (h >= 10.5 && h < 15.5) return r < 0.35 ? 'shop' : r < 0.7 ? 'leisure' : 'tourism';
    return r < 0.55 ? 'leisure' : 'return';
  }
  if (h >= 10 && h < 18) return r < 0.4 ? 'shop' : r < 0.75 ? 'tourism' : 'leisure';
  return r < 0.6 ? 'leisure' : 'return';
}

interface ZoneSampler {
  cumRes: Float64Array;
  cumJobs: Float64Array;
  cumAttract: Float64Array;
}

export class AgentSystem {
  agents = new Map<number, Agent>();
  /** waiting agents per stop */
  waiting = new Map<number, number[]>();
  private nextId = 1;
  private spawnAccum = 0;
  private sampler: ZoneSampler;
  private rng: () => number;

  // Daily accumulators the stats system reads and resets.
  completedToday = 0;
  abandonedToday = 0;
  boardingsToday = 0;
  journeyMinSum = 0;
  unservedDemand = 0;
  /** EMA of trip satisfaction 0..100 */
  happiness = 70;
  /** EMA share of trips lost to cars 0..1 */
  carShare = 0.32;

  constructor(
    private map: CityMap,
    private net: Network,
    seed: number,
  ) {
    this.rng = makeRng(seed ^ 0xa9e27);
    const n = map.zones.length;
    const cumRes = new Float64Array(n);
    const cumJobs = new Float64Array(n);
    const cumAttract = new Float64Array(n);
    let r = 0;
    let j = 0;
    let a = 0;
    for (let i = 0; i < n; i++) {
      r += map.zones[i].res;
      j += map.zones[i].jobs;
      a += map.zones[i].attract;
      cumRes[i] = r;
      cumJobs[i] = j;
      cumAttract[i] = a;
    }
    this.sampler = { cumRes, cumJobs, cumAttract };
  }

  private sampleZone(cum: Float64Array): number {
    const total = cum[cum.length - 1];
    const r = this.rng() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private samplePoint(kind: 'res' | 'jobs' | 'attract'): Vec {
    const cum =
      kind === 'res' ? this.sampler.cumRes : kind === 'jobs' ? this.sampler.cumJobs : this.sampler.cumAttract;
    const z = this.map.zones[this.sampleZone(cum)];
    return {
      x: z.cx + (this.rng() - 0.5) * this.map.zoneSize,
      y: z.cy + (this.rng() - 0.5) * this.map.zoneSize,
    };
  }

  private odFor(purpose: Purpose): { o: Vec; d: Vec } {
    switch (purpose) {
      case 'commute':
      case 'school':
        return { o: this.samplePoint('res'), d: this.samplePoint('jobs') };
      case 'return':
        return { o: this.samplePoint('jobs'), d: this.samplePoint('res') };
      case 'shop':
      case 'leisure':
        return { o: this.samplePoint('res'), d: this.samplePoint('attract') };
      case 'tourism':
        return { o: this.samplePoint('attract'), d: this.samplePoint('attract') };
    }
  }

  /**
   * Spawn trips for this tick. `demandBoost(p)` lets events spike demand near
   * venues; extra spawns near the boost centre are handled by the caller.
   */
  spawn(
    gameDtMin: number,
    minute: number,
    weekend: boolean,
    demandScale: number,
    weatherDemand: number,
    patienceScale: number,
    fares: { bus: number; tram: number; tube: number; boat: number },
    plansBudget: number,
  ): void {
    const minuteOfDay = minute % MIN_PER_DAY;
    const rate = DAILY_TRIPS_BASE * demandScale * todProfile(minuteOfDay, weekend) * weatherDemand;
    this.spawnAccum += rate * gameDtMin;
    let plans = 0;
    while (this.spawnAccum >= 1 && plans < plansBudget) {
      this.spawnAccum -= 1;
      if (this.agents.size >= MAX_ACTIVE_AGENTS) {
        // Over the live cap: count it statistically instead of simulating.
        this.unservedDemand++;
        continue;
      }
      plans++;
      this.spawnOne(minute, minuteOfDay, weekend, patienceScale, fares);
    }
    // Any unbudgeted remainder is deferred to the next frame (spawnAccum keeps it).
  }

  private spawnOne(
    minute: number,
    minuteOfDay: number,
    weekend: boolean,
    patienceScale: number,
    fares: { bus: number; tram: number; tube: number; boat: number },
  ): void {
    const purpose = pickPurpose(minuteOfDay, weekend, this.rng);
    const { o, d } = this.odFor(purpose);
    if (dist(o, d) < 250) return; // too short to be a trip

    const walkSpeed = 1.1 + this.rng() * 0.6;
    const maxWalk = 400 + this.rng() * 500;
    const income = lognormal(this.rng, 32000, 0.6);
    const graph = this.net.ensureGraph(fares);
    const plan = planJourney(this.net, graph, o, d, walkSpeed, maxWalk, minute);
    if (!plan) {
      // Drives instead: nudges congestion up via car share EMA.
      this.carShare = this.carShare * 0.9998 + 1 * 0.0002;
      this.unservedDemand++;
      return;
    }
    if (!plan.usesTransit) {
      this.carShare = this.carShare * 0.9998; // walking trip: slightly reduces car share
    }
    const agent: Agent = {
      id: this.nextId++,
      state: 'walkToStop',
      p: { ...o },
      origin: o,
      dest: d,
      purpose,
      walkSpeed,
      maxWalk,
      patience: (5 + this.rng() * 9) * patienceScale,
      valueOfTime: Math.max(5, income / 2000),
      legs: plan.legs,
      legIdx: 0,
      walkS: 0,
      waitMin: 0,
      replanned: false,
      startMin: minute,
      expectedMin: plan.minutes,
      vehicleId: -1,
    };
    if (plan.legs.length === 1) agent.state = 'walkFinal';
    this.agents.set(agent.id, agent);
  }

  /* --------------------------------------------------------- lifecycle */

  step(gameDt: number, minute: number, walkFactor: number, fares: { bus: number; tram: number; tube: number; boat: number }): void {
    const toRemove: number[] = [];
    for (const agent of this.agents.values()) {
      switch (agent.state) {
        case 'walkToStop':
        case 'walkFinal': {
          const leg = agent.legs[agent.legIdx];
          if (!leg || leg.kind !== 'walk') {
            this.advanceLeg(agent, minute);
            break;
          }
          const total = dist(leg.from, leg.to);
          agent.walkS += agent.walkSpeed * walkFactor * gameDt;
          if (agent.walkS >= total) {
            agent.p = { ...leg.to };
            this.advanceLeg(agent, minute);
          } else {
            const t = agent.walkS / Math.max(1, total);
            agent.p = {
              x: leg.from.x + (leg.to.x - leg.from.x) * t,
              y: leg.from.y + (leg.to.y - leg.from.y) * t,
            };
          }
          break;
        }
        case 'wait': {
          agent.waitMin += gameDt / 60;
          if (agent.waitMin > agent.patience) {
            const leg = agent.legs[agent.legIdx];
            this.unqueue(agent, leg && leg.kind === 'ride' ? leg.boardStop : -1);
            if (!agent.replanned) {
              const graph = this.net.ensureGraph(fares);
              const ok = replan(this.net, graph, agent, minute);
              if (ok) {
                agent.state = agent.legs[0].kind === 'walk' ? 'walkToStop' : 'wait';
                if (agent.state === 'wait') this.enqueue(agent);
                break;
              }
            }
            agent.state = 'abandoned';
            this.abandonedToday++;
            this.happiness = this.happiness * 0.999 + 15 * 0.001;
            this.carShare = this.carShare * 0.999 + 1 * 0.001;
            toRemove.push(agent.id);
          }
          break;
        }
        case 'ride':
          break; // moved by the vehicle
        case 'done':
        case 'abandoned':
          toRemove.push(agent.id);
          break;
      }
    }
    for (const id of toRemove) this.agents.delete(id);
  }

  /** Advance to the next leg after finishing the current one. */
  advanceLeg(agent: Agent, minute: number): void {
    agent.legIdx++;
    agent.walkS = 0;
    agent.waitMin = 0;
    if (agent.legIdx >= agent.legs.length) {
      this.completeTrip(agent, minute);
      return;
    }
    const leg = agent.legs[agent.legIdx];
    if (leg.kind === 'walk') {
      agent.state = agent.legIdx === agent.legs.length - 1 ? 'walkFinal' : 'walkToStop';
    } else {
      agent.state = 'wait';
      this.enqueue(agent);
    }
  }

  private completeTrip(agent: Agent, minute: number): void {
    agent.state = 'done';
    this.completedToday++;
    const took = minute - agent.startMin;
    this.journeyMinSum += took;
    // Satisfaction: beat expectations → happy; big overrun → unhappy.
    const ratio = took / Math.max(3, agent.expectedMin);
    const score = ratio < 1.15 ? 92 : ratio < 1.5 ? 70 : ratio < 2 ? 45 : 25;
    this.happiness = this.happiness * 0.9985 + score * 0.0015;
    this.agents.delete(agent.id);
  }

  enqueue(agent: Agent): void {
    const leg = agent.legs[agent.legIdx];
    if (!leg || leg.kind !== 'ride') return;
    agent.p = { ...this.net.stops[leg.boardStop]!.p };
    const q = this.waiting.get(leg.boardStop);
    if (q) q.push(agent.id);
    else this.waiting.set(leg.boardStop, [agent.id]);
  }

  unqueue(agent: Agent, stopId: number): void {
    if (stopId < 0) return;
    const q = this.waiting.get(stopId);
    if (!q) return;
    const idx = q.indexOf(agent.id);
    if (idx >= 0) q.splice(idx, 1);
  }

  /* ------------------------------------------------- boarding hooks API */

  collectBoarders(stopId: number, routeId: number, dir: 1 | -1, space: number): number[] {
    const q = this.waiting.get(stopId);
    if (!q || !q.length) return [];
    const out: number[] = [];
    for (let i = 0; i < q.length && out.length < space; i++) {
      const agent = this.agents.get(q[i]);
      if (!agent) continue;
      const leg = agent.legs[agent.legIdx];
      if (leg && leg.kind === 'ride' && leg.routeId === routeId && leg.dir === dir) out.push(q[i]);
    }
    // remove picked ones from the queue
    for (const id of out) {
      const idx = q.indexOf(id);
      if (idx >= 0) q.splice(idx, 1);
      const agent = this.agents.get(id);
      if (agent) {
        agent.state = 'ride';
        agent.waitMin = 0;
      }
    }
    return out;
  }

  shouldAlight(agentId: number, routeId: number, stopIdx: number): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return true; // ghost — clean out
    const leg = agent.legs[agent.legIdx];
    if (!leg || leg.kind !== 'ride' || leg.routeId !== routeId) return true;
    return leg.alightIdx === stopIdx;
  }

  onAlight(agentId: number, stopId: number, minute: number): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const stop = this.net.stops[stopId];
    if (stop) agent.p = { ...stop.p };
    agent.vehicleId = -1;
    this.advanceLeg(agent, minute);
  }

  onBoardStat(): void {
    this.boardingsToday++;
  }

  resetDay(): void {
    this.completedToday = 0;
    this.abandonedToday = 0;
    this.boardingsToday = 0;
    this.journeyMinSum = 0;
    this.unservedDemand = 0;
  }
}
