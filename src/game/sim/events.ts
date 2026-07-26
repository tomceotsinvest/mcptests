import type { Incident, IncidentKind, Route, Stop } from '../types';
import { MIN_PER_DAY } from '../constants';
import { Network } from './network';

/**
 * Random incidents. Each has a duration and a target; effects are applied
 * directly to routes/stops (slow factors, closures) or read by the demand
 * and traffic systems (roadworks level, demand spikes).
 */

const EVENT_DEFS: { kind: IncidentKind; weight: number; minDur: number; maxDur: number }[] = [
  { kind: 'signalFailure', weight: 3, minDur: 25, maxDur: 90 },
  { kind: 'stationClosed', weight: 2, minDur: 30, maxDur: 120 },
  { kind: 'floodedStation', weight: 1, minDur: 60, maxDur: 240 },
  { kind: 'roadworks', weight: 3, minDur: 240, maxDur: 1200 },
  { kind: 'breakdown', weight: 3, minDur: 15, maxDur: 45 },
  { kind: 'demo', weight: 1.5, minDur: 90, maxDur: 240 },
  { kind: 'concert', weight: 2, minDur: 150, maxDur: 260 },
  { kind: 'football', weight: 1.5, minDur: 150, maxDur: 220 },
  { kind: 'strike', weight: 0.5, minDur: 400, maxDur: 900 },
];

export class EventSystem {
  incidents: Incident[] = [];
  news: string[] = [];
  /** 0..n — count of live roadworks/demos, read by the traffic model */
  roadworksLevel = 0;
  private nextId = 1;
  private accum = 0;

  constructor(private rng: () => number) {}

  push(msg: string, minute: number): void {
    const d = Math.floor(minute / MIN_PER_DAY) + 1;
    const h = Math.floor((minute % MIN_PER_DAY) / 60);
    const m = Math.floor(minute % 60);
    this.news.unshift(`Day ${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} — ${msg}`);
    if (this.news.length > 14) this.news.length = 14;
  }

  update(gameDtMin: number, minute: number, eventScale: number, rainy: boolean, net: Network): void {
    // Expire
    this.incidents = this.incidents.filter((inc) => {
      if (inc.end > minute) return true;
      if (inc.kind === 'roadworks' || inc.kind === 'demo') this.roadworksLevel = Math.max(0, this.roadworksLevel - 1);
      this.push(`${inc.title} — cleared`, minute);
      return false;
    });

    // ~1 event per 4 game-hours at scale 1.
    this.accum += (gameDtMin / 240) * eventScale;
    if (this.accum < 1) return;
    this.accum -= 1;

    let defs = EVENT_DEFS;
    if (rainy) defs = defs.map((d) => (d.kind === 'floodedStation' ? { ...d, weight: d.weight * 4 } : d));
    let total = 0;
    for (const d of defs) total += d.weight;
    let r = this.rng() * total;
    let def = defs[0];
    for (const d of defs) {
      r -= d.weight;
      if (r <= 0) {
        def = d;
        break;
      }
    }
    const dur = def.minDur + this.rng() * (def.maxDur - def.minDur);
    this.trigger(def.kind, minute, minute + dur, net);
  }

  private randomRoute(net: Network, mode?: 'tube' | 'road'): Route | null {
    const candidates = net.routes.filter(
      (r): r is Route =>
        !!r &&
        r.active &&
        (mode === undefined || (mode === 'tube' ? r.mode === 'tube' : r.mode === 'bus' || r.mode === 'tram')),
    );
    if (!candidates.length) return null;
    return candidates[Math.floor(this.rng() * candidates.length)];
  }

  private randomStop(net: Network, tubeOnly: boolean): Stop | null {
    const candidates = net.stops.filter((s): s is Stop => !!s && (!tubeOnly || s.mode === 'tube'));
    if (!candidates.length) return null;
    return candidates[Math.floor(this.rng() * candidates.length)];
  }

  trigger(kind: IncidentKind, start: number, end: number, net: Network): void {
    const inc: Incident = { id: this.nextId++, kind, title: '', start, end };
    switch (kind) {
      case 'signalFailure': {
        const r = this.randomRoute(net, 'tube');
        if (!r) return;
        r.slowUntil = end;
        r.slowFactor = 0.45;
        inc.routeId = r.id;
        inc.title = `Signal failure on the ${r.name} line — severe delays`;
        break;
      }
      case 'stationClosed':
      case 'floodedStation': {
        const s = this.randomStop(net, true);
        if (!s) return;
        s.closedUntil = end;
        inc.stopId = s.id;
        inc.title =
          kind === 'floodedStation'
            ? `${s.name} station flooded — closed until further notice`
            : `${s.name} station closed (security alert)`;
        net.graphDirty = true;
        break;
      }
      case 'roadworks': {
        this.roadworksLevel++;
        inc.title = 'Major roadworks — expect congestion';
        break;
      }
      case 'demo': {
        this.roadworksLevel++;
        inc.title = 'Large demonstration in central London — roads disrupted';
        break;
      }
      case 'breakdown': {
        const r = this.randomRoute(net, 'road');
        if (!r) return;
        r.slowUntil = end;
        r.slowFactor = 0.55;
        inc.routeId = r.id;
        inc.title = `Vehicle breakdown on route ${r.name} — delays`;
        break;
      }
      case 'concert':
      case 'football': {
        // Demand spike near a venue; agents.ts reads live incidents via engine.
        inc.title = kind === 'concert' ? 'Concert tonight — crowds expected' : 'Big match today — crowds expected';
        break;
      }
      case 'strike': {
        // All tube routes slowed hard.
        for (const r of net.routes) {
          if (r && r.mode === 'tube') {
            r.slowUntil = end;
            r.slowFactor = 0.35;
          }
        }
        inc.title = 'Industrial action on the Underground — severe disruption';
        break;
      }
    }
    this.incidents.push(inc);
    this.push(inc.title, start);
  }
}
