import type {
  CityMap,
  DayStats,
  Difficulty,
  Mode,
  Overlay,
  Route,
  RouteDraft,
  SaveGame,
  Tool,
  UISnapshot,
  Vec,
} from '../types';
import { RoadClass } from '../types';
import {
  BASE_TIME_SCALE,
  COSTS,
  DAY_ROLL_MIN,
  DEFAULT_FARES,
  DIFFICULTIES,
  MIN_PER_DAY,
  SAVE_VERSION,
  SPEEDS,
  vehicleType,
  VEHICLE_TYPES,
} from '../constants';
import { cumulative, dist, makeRng, resample, SpatialGrid } from '../util';
import { buildMap, buildNodeGrid, nearestRoadNode, roadPath } from '../map/buildMap';
import { AgentSystem } from './agents';
import { EconomySystem, StatsHistory } from './economy';
import { EventSystem } from './events';
import { Network } from './network';
import { AmbientTraffic, congestionIndex, speedFactor } from './traffic';
import { ACHIEVEMENTS, checkAchievements } from './achievements';
import { daylight, nextWeather, seasonOf, WEATHER_EFFECTS, WEATHER_LABEL } from './weather';
import { saveToLocal } from './saveload';
import type { WeatherState } from '../types';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NEW_TUBE_NAMES = ['Fleet', 'Brunel', 'Thames', 'Wren', 'Sterling', 'Orbital', 'Regent', 'Turing'];

/**
 * The Engine owns all game state and the simulation loop. React never
 * touches hot data: it reads `snapshot()` at ~4 Hz and issues commands.
 */
export class Engine {
  map: CityMap;
  nodeGrid: SpatialGrid;
  net: Network;
  agents: AgentSystem;
  economy: EconomySystem;
  events: EventSystem;
  ambient: AmbientTraffic;
  history = new StatsHistory();

  seed: number;
  difficulty: Difficulty;
  minute: number; // absolute game minutes since day 0 00:00
  speedIdx = 1;
  weather: WeatherState;
  congestion = 0.2;
  gameOver = false;

  /** UI state lives here so snapshots and input handling stay in one place */
  tool: Tool = 'select';
  overlay: Overlay = 'none';
  draft: RouteDraft | null = null;
  selectedRoute = -1;
  selectedStop = -1;
  camera = { x: 0, y: 300, zoom: 0.09 };

  achievementsUnlocked = new Set<string>();
  private rng: () => number;
  private routeCounters: Record<Mode, number> = { bus: 0, tram: 0, tube: 0, boat: 0 };

  /** day accumulators */
  private congestionSum = 0;
  private congestionSamples = 0;
  private lastMinuteInt = -1;
  private lastGraphRebuildMin = 0;

  /** snapshot plumbing */
  private version = 0;
  private snapshotCache: UISnapshot | null = null;
  private listeners = new Set<() => void>();
  private lastUiPush = 0;

  constructor(seed: number, difficulty: Difficulty, save?: SaveGame) {
    this.seed = seed;
    this.difficulty = difficulty;
    this.rng = makeRng(seed ^ 0xbeef);
    this.map = buildMap(seed);
    this.nodeGrid = buildNodeGrid(this.map);
    this.net = new Network(this.map);
    const diff = DIFFICULTIES[difficulty];
    this.economy = new EconomySystem(
      diff.sandbox ? 1e12 : diff.startCash,
      DEFAULT_FARES,
      diff.sandbox,
      diff.costScale,
      diff.grantScale,
    );
    this.events = new EventSystem(makeRng(seed ^ 0xe7e7));
    this.agents = new AgentSystem(this.map, this.net, seed);
    this.ambient = new AmbientTraffic(this.map, makeRng(seed ^ 0x7a11));
    this.minute = 6.5 * 60; // Monday 06:30
    this.weather = nextWeather(this.minute, 0, this.rng);

    if (save) this.restore(save);
    else this.setupLegacyTube();

    this.net.buildGraph(this.economy.fares);
    this.events.push('You have been appointed Transport Commissioner for London.', this.minute);
  }

  /* -------------------------------------------------- legacy Underground */

  private setupLegacyTube(): void {
    const stationStop = new Map<number, number>(); // station idx -> stop id
    for (const line of this.map.tubeLines) {
      const stopIds = line.stations.map((si) => {
        let sid = stationStop.get(si);
        if (sid === undefined) {
          const st = this.map.tubeStations[si];
          sid = this.net.addStop('tube', st.p, -1, st.name, true).id;
          stationStop.set(si, sid);
        }
        return sid;
      });
      const pts = line.stations.map((si) => this.map.tubeStations[si].p);
      if (line.circular) pts.push(pts[0]);
      const path = resample(pts, 140);
      const r = this.net.createRoute('tube', line.name, stopIds, path, line.circular, 'tubeTrain');
      r.color = line.color;
      r.legacy = true;
      r.vehiclesTarget = line.baseTrains;
    }
    this.net.syncFleets(); // starting assets — no charge
  }

  /* ------------------------------------------------------------- update */

  update(realDtMs: number): void {
    const speed = SPEEDS[this.speedIdx];
    if (speed > 0 && !this.gameOver) {
      const gameDt = Math.min(realDtMs, 100) * 0.001 * BASE_TIME_SCALE * speed; // game seconds
      this.tick(gameDt);
    }
    // Ambient traffic always animates a little (looks alive even paused).
    this.ambient.update(speed > 0 ? Math.min(realDtMs, 100) * 0.001 * BASE_TIME_SCALE * Math.max(1, speed) : 0, this.congestion);

    const now = performance.now();
    if (now - this.lastUiPush > 250) {
      this.lastUiPush = now;
      this.bump();
    }
  }

  private tick(gameDt: number): void {
    const prevMinute = this.minute;
    this.minute += gameDt / 60;
    const minuteOfDay = this.minute % MIN_PER_DAY;
    const day = Math.floor(this.minute / MIN_PER_DAY);
    const weekend = day % 7 >= 5;
    const diff = DIFFICULTIES[this.difficulty];
    const wfx = WEATHER_EFFECTS[this.weather.kind];

    // Per-minute systems.
    const minuteInt = Math.floor(this.minute);
    if (minuteInt !== this.lastMinuteInt) {
      const elapsed = this.lastMinuteInt < 0 ? 1 : minuteInt - this.lastMinuteInt;
      this.lastMinuteInt = minuteInt;

      if (this.minute >= this.weather.until) {
        this.weather = nextWeather(this.minute, day, this.rng);
        this.events.push(`Weather update: ${WEATHER_LABEL[this.weather.kind]}, ${this.weather.temp}°C`, this.minute);
      }
      this.events.update(elapsed, this.minute, diff.eventScale, wfx.road < 0.85, this.net);
      this.congestion = congestionIndex(
        minuteOfDay,
        weekend,
        wfx.road,
        this.agents.carShare,
        this.events.roadworksLevel,
        this.economy.policies.congestionCharge,
      );
      this.congestionSum += this.congestion;
      this.congestionSamples++;
      this.ambient.setLevel(this.congestion);

      // Hourly transit-graph refresh keeps crowding costs current.
      if (this.minute - this.lastGraphRebuildMin > 60) {
        this.net.graphDirty = true;
        this.lastGraphRebuildMin = this.minute;
      }
    }

    // Demand & agents.
    const holidays = isSchoolHoliday(day);
    let demandScale = diff.demandScale * (holidays ? 0.9 : 1);
    if (this.events.incidents.some((i) => i.kind === 'concert' || i.kind === 'football')) demandScale *= 1.18;
    const bikeRelief = 1 - this.economy.policies.bikeShare * 0.02;
    this.agents.spawn(
      gameDt / 60,
      this.minute,
      weekend,
      demandScale * bikeRelief,
      wfx.demand * (1 + wfx.transitShift * 0.4),
      diff.patienceScale,
      this.economy.fares,
      30,
    );
    this.agents.step(gameDt, this.minute, wfx.walk, this.economy.fares);

    // Vehicles.
    const hooks = {
      collectBoarders: (stopId: number, routeId: number, dir: 1 | -1, space: number) =>
        this.agents.collectBoarders(stopId, routeId, dir, space),
      shouldAlight: (agentId: number, routeId: number, stopIdx: number) =>
        this.agents.shouldAlight(agentId, routeId, stopIdx),
      onAlight: (agentId: number, stopId: number) => this.agents.onAlight(agentId, stopId, this.minute),
      onBoard: (_agentId: number, _routeId: number, mode: Mode) => {
        this.economy.earnFare(this.economy.fares[mode]);
        this.agents.onBoardStat();
      },
    };
    this.net.step(gameDt, this.minute, hooks, (r) => this.congestionFor(r, wfx.road));

    // Day rollover at 03:00.
    const dayOf = (m: number) => Math.floor((m - DAY_ROLL_MIN) / MIN_PER_DAY);
    if (dayOf(this.minute) !== dayOf(prevMinute)) this.rollDay(day);
  }

  private congestionFor(r: Route, weatherRoad: number): number {
    if (r.mode === 'tube') return 0.96 * (0.9 + 0.1 * weatherRoad);
    if (r.mode === 'boat') return 0.9 * weatherRoad;
    // buses/trams feel city congestion, shielded by bus lanes
    return Math.max(0.15, speedFactor(this.congestion, RoadClass.A, this.net.laneShareOf(r.id)) * weatherRoad);
  }

  private rollDay(day: number): void {
    const a = this.agents;
    const passengers = a.boardingsToday;
    const completed = Math.max(1, a.completedToday);
    const vehicleKm = this.net.kmByType;
    const { profit, co2, revenue, costs } = this.economy.settleDay(this.net, vehicleKm, day, a.happiness, passengers);
    const stats: DayStats = {
      day,
      passengers,
      abandoned: a.abandonedToday,
      revenue,
      costs,
      profit,
      avgJourneyMin: a.journeyMinSum / completed,
      happiness: a.happiness,
      co2Tonnes: co2,
      congestion: this.congestionSamples ? this.congestionSum / this.congestionSamples : 0,
    };
    this.history.push(stats);
    for (const r of this.net.routes) {
      if (r) {
        r.boardingsYesterday = r.boardingsToday;
        r.boardingsToday = 0;
      }
    }
    this.net.kmByType = new Map();
    a.resetDay();
    this.congestionSum = 0;
    this.congestionSamples = 0;

    // Bankruptcy check (non-sandbox): out of cash and out of credit.
    if (!this.economy.sandbox && this.economy.cash < 0) {
      const need = -this.economy.cash + 50_000_000;
      if (!this.economy.takeLoan(Math.min(need, COSTS.loanMax - this.economy.loan))) {
        if (this.economy.cash < -COSTS.loanMax * 0.2) {
          this.gameOver = true;
          this.events.push('The Treasury has removed you from office. Game over.', this.minute);
        }
      } else {
        this.events.push('Emergency loan drawn to cover operating losses.', this.minute);
      }
    }

    const fresh = checkAchievements(
      {
        routeCount: this.net.routes.filter((r) => r && !r.legacy).length,
        hasCustomTube: this.net.routes.some((r) => r && r.mode === 'tube' && !r.legacy),
        hasBoat: this.net.routes.some((r) => r && r.mode === 'boat'),
        happiness: a.happiness,
        cash: this.economy.cash,
        day,
        history: this.history.history,
      },
      this.achievementsUnlocked,
    );
    for (const id of fresh) {
      const def = ACHIEVEMENTS.find((x) => x.id === id);
      if (def) this.events.push(`🏆 Achievement unlocked: ${def.name}`, this.minute);
    }

    saveToLocal(this.toSave()); // autosave
  }

  /* -------------------------------------------------------- map editing */

  handleMapClick(p: Vec, worldRadius: number): void {
    if (this.gameOver) return;
    switch (this.tool) {
      case 'select':
        this.select(p, worldRadius);
        break;
      case 'busRoute':
        this.draftRoadStop(p, 'bus');
        break;
      case 'tramRoute':
        this.draftRoadStop(p, 'tram');
        break;
      case 'tubeLine':
        this.draftTubeStation(p);
        break;
      case 'boatRoute':
        this.draftPier(p);
        break;
      case 'delete':
        this.deleteAt(p, worldRadius);
        break;
    }
    this.bump();
  }

  private select(p: Vec, radius: number): void {
    // stops first, then routes by path proximity
    const near: number[] = [];
    this.net.stopsNear(p, Math.max(radius, 60), near);
    if (near.length) {
      near.sort((x, y) => dist(this.net.stops[x]!.p, p) - dist(this.net.stops[y]!.p, p));
      this.selectedStop = near[0];
      const s = this.net.stops[near[0]]!;
      this.selectedRoute = s.routes.length ? s.routes[0] : -1;
      return;
    }
    this.selectedStop = -1;
    let best = -1;
    let bestD = Math.max(radius, 70);
    for (const r of this.net.routes) {
      if (!r) continue;
      for (let i = 0; i < r.path.length; i += 2) {
        const d = dist(r.path[i], p);
        if (d < bestD) {
          bestD = d;
          best = r.id;
        }
      }
    }
    this.selectedRoute = best;
  }

  startDraft(mode: Mode): void {
    this.cancelDraft();
    this.draft = { mode, stops: [], newStops: [], path: [], cost: 0, valid: false, message: 'Click the map to place stops.' };
    this.tool = mode === 'bus' ? 'busRoute' : mode === 'tram' ? 'tramRoute' : mode === 'tube' ? 'tubeLine' : 'boatRoute';
    this.bump();
  }

  private ensureDraft(mode: Mode): RouteDraft {
    if (!this.draft || this.draft.mode !== mode) this.startDraft(mode);
    return this.draft!;
  }

  private draftRoadStop(p: Vec, mode: 'bus' | 'tram'): void {
    const draft = this.ensureDraft(mode);
    const nodeId = nearestRoadNode(this.map, this.nodeGrid, p, 220);
    if (nodeId < 0) {
      draft.message = 'No road near that point.';
      return;
    }
    const np = this.map.nodes[nodeId].p;
    // Reuse an existing same-mode stop on this node if present.
    let stopId = -1;
    const near: number[] = [];
    this.net.stopsNear(np, 40, near);
    for (const sid of near) {
      const s = this.net.stops[sid]!;
      if (s.mode === mode && s.nodeId === nodeId) {
        stopId = sid;
        break;
      }
    }
    if (stopId < 0) {
      const name = this.stopNameFor(nodeId);
      const s = this.net.addStop(mode, np, nodeId, name);
      stopId = s.id;
      draft.newStops.push(stopId);
    }
    if (draft.stops[draft.stops.length - 1] === stopId) return;
    draft.stops.push(stopId);
    this.rebuildDraftPath(draft);
  }

  private draftTubeStation(p: Vec): void {
    const draft = this.ensureDraft('tube');
    // Reuse any tube station within 260 m.
    let stopId = -1;
    const near: number[] = [];
    this.net.stopsNear(p, 260, near);
    let bestD = 260;
    for (const sid of near) {
      const s = this.net.stops[sid]!;
      if (s.mode !== 'tube') continue;
      const d = dist(s.p, p);
      if (d < bestD) {
        bestD = d;
        stopId = sid;
      }
    }
    if (stopId < 0) {
      const s = this.net.addStop('tube', p, -1, `New Station ${this.net.stops.length}`);
      stopId = s.id;
      draft.newStops.push(stopId);
    }
    if (draft.stops[draft.stops.length - 1] === stopId) return;
    draft.stops.push(stopId);
    this.rebuildDraftPath(draft);
  }

  private draftPier(p: Vec): void {
    const draft = this.ensureDraft('boat');
    let best = -1;
    let bestD = 500;
    this.map.piers.forEach((pier, i) => {
      const d = dist(pier.p, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) {
      draft.message = 'Click near a pier on the Thames.';
      return;
    }
    const pier = this.map.piers[best];
    let stopId = -1;
    const near: number[] = [];
    this.net.stopsNear(pier.p, 30, near);
    for (const sid of near) if (this.net.stops[sid]!.mode === 'boat') stopId = sid;
    if (stopId < 0) {
      const s = this.net.addStop('boat', pier.p, -1, pier.name);
      stopId = s.id;
      draft.newStops.push(stopId);
    }
    if (draft.stops[draft.stops.length - 1] === stopId) return;
    draft.stops.push(stopId);
    this.rebuildDraftPath(draft);
  }

  private rebuildDraftPath(draft: RouteDraft): void {
    draft.valid = false;
    if (draft.stops.length < 2) {
      draft.path = draft.stops.length ? [this.net.stops[draft.stops[0]]!.p] : [];
      draft.message = 'Add at least one more stop.';
      draft.cost = this.draftCost(draft);
      return;
    }
    if (draft.mode === 'bus' || draft.mode === 'tram') {
      const path: Vec[] = [];
      for (let i = 1; i < draft.stops.length; i++) {
        const a = this.net.stops[draft.stops[i - 1]]!;
        const b = this.net.stops[draft.stops[i]]!;
        const nodes = roadPath(this.map, a.nodeId, b.nodeId);
        if (!nodes) {
          draft.message = 'No street connection between those stops.';
          return;
        }
        for (let k = i === 1 ? 0 : 1; k < nodes.length; k++) path.push(this.map.nodes[nodes[k]].p);
      }
      draft.path = path;
    } else if (draft.mode === 'tube') {
      draft.path = resample(draft.stops.map((sid) => this.net.stops[sid]!.p), 150);
    } else {
      // boat: slice the Thames between successive piers
      const path: Vec[] = [];
      const th = this.map.thames;
      const cum = this.map.thamesCum;
      const sOf = (sid: number) => {
        const stop = this.net.stops[sid]!;
        const pier = this.map.piers.find((pp) => dist(pp.p, stop.p) < 40)!;
        return pier.s;
      };
      for (let i = 1; i < draft.stops.length; i++) {
        const s0 = sOf(draft.stops[i - 1]);
        const s1 = sOf(draft.stops[i]);
        const seg = sliceAlong(th, cum, s0, s1);
        for (let k = i === 1 ? 0 : 1; k < seg.length; k++) path.push(seg[k]);
      }
      draft.path = path;
    }
    draft.cost = this.draftCost(draft);
    draft.valid = draft.stops.length >= 2 && draft.path.length >= 2;
    const km = (cumulative(draft.path).at(-1) ?? 0) / 1000;
    draft.message = draft.valid
      ? `${draft.stops.length} stops, ${km.toFixed(1)} km. Confirm to build.`
      : draft.message;
  }

  private draftCost(draft: RouteDraft): number {
    const lenM = draft.path.length > 1 ? (cumulative(draft.path).at(-1) ?? 0) : 0;
    const scale = DIFFICULTIES[this.difficulty].costScale * this.economy.inflation;
    let c = 0;
    if (draft.mode === 'bus') c = draft.newStops.length * COSTS.busStop;
    if (draft.mode === 'tram') c = draft.newStops.length * COSTS.tramStop + (lenM / 1000) * COSTS.tramPerKm;
    if (draft.mode === 'tube') c = draft.newStops.length * COSTS.tubeStation + (lenM / 1000) * COSTS.tubePerKm;
    if (draft.mode === 'boat') c = draft.newStops.length * COSTS.pierUse;
    return c * scale;
  }

  private stopNameFor(nodeId: number): string {
    for (const eid of this.map.nodes[nodeId].adj) {
      const name = this.map.edges[eid].name;
      if (name) return `${name.split('/')[0].trim()}`;
    }
    return 'Stop';
  }

  commitDraft(): void {
    const draft = this.draft;
    if (!draft || !draft.valid) return;
    if (!this.economy.spend(draft.cost)) {
      draft.message = 'Not enough funds (consider a loan).';
      this.bump();
      return;
    }
    const mode = draft.mode;
    this.routeCounters[mode]++;
    const n = this.routeCounters[mode];
    const name =
      mode === 'bus'
        ? `Route ${n + 9}`
        : mode === 'tram'
          ? `Tram T${n}`
          : mode === 'boat'
            ? `River RB${n}`
            : `${NEW_TUBE_NAMES[(n - 1) % NEW_TUBE_NAMES.length]} line`;
    const circular =
      draft.stops.length > 3 && draft.stops[0] === draft.stops[draft.stops.length - 1];
    const stops = circular ? draft.stops.slice(0, -1) : draft.stops;
    const route = this.net.createRoute(mode, name, stops, draft.path, circular, defaultVehicleFor(mode));
    route.vehiclesTarget = mode === 'tube' ? 3 : mode === 'boat' ? 2 : 4;
    const fleetCost = this.net.syncFleets();
    this.economy.spend(fleetCost);
    this.events.push(`${name} opened (${stops.length} stops).`, this.minute);
    this.draft = null;
    this.selectedRoute = route.id;
    this.tool = 'select';
    this.bump();
  }

  cancelDraft(): void {
    if (!this.draft) return;
    for (const sid of this.draft.newStops) {
      const s = this.net.stops[sid];
      if (s && s.routes.length === 0) this.net.stops[sid] = null;
    }
    this.net.rebuildStopGrid();
    this.net.graphDirty = true;
    this.draft = null;
    this.bump();
  }

  /** Remove the last stop added to the draft. */
  undoDraftStop(): void {
    const draft = this.draft;
    if (!draft || !draft.stops.length) return;
    const removed = draft.stops.pop()!;
    if (!draft.stops.includes(removed) && draft.newStops.includes(removed)) {
      const s = this.net.stops[removed];
      if (s && s.routes.length === 0) {
        this.net.stops[removed] = null;
        this.net.rebuildStopGrid();
      }
      draft.newStops = draft.newStops.filter((x) => x !== removed);
    }
    this.rebuildDraftPath(draft);
    this.bump();
  }

  private deleteAt(p: Vec, radius: number): void {
    // Delete a non-legacy route whose path passes near the click.
    let best = -1;
    let bestD = Math.max(radius, 80);
    for (const r of this.net.routes) {
      if (!r || r.legacy) continue;
      for (let i = 0; i < r.path.length; i += 2) {
        const d = dist(r.path[i], p);
        if (d < bestD) {
          bestD = d;
          best = r.id;
        }
      }
    }
    if (best >= 0) {
      const r = this.net.routes[best]!;
      this.events.push(`${r.name} withdrawn.`, this.minute);
      this.deleteRoute(best);
      return;
    }
    // Otherwise delete an unused stop.
    const near: number[] = [];
    this.net.stopsNear(p, Math.max(radius, 60), near);
    for (const sid of near) {
      const s = this.net.stops[sid]!;
      if (!s.legacy && s.routes.length === 0) {
        this.net.removeStop(sid);
        return;
      }
    }
  }

  deleteRoute(id: number): void {
    const r = this.net.routes[id];
    if (!r || r.legacy) return;
    // strand riding agents gracefully: they abandon
    for (const v of this.net.vehicles.values()) {
      if (v.routeId !== id) continue;
      for (const aid of v.passengers) {
        const agent = this.agents.agents.get(aid);
        if (agent) this.agents.agents.delete(aid);
      }
    }
    // sell fleet at half price
    const vt = vehicleType(r.vehicleType);
    let count = 0;
    for (const v of this.net.vehicles.values()) if (v.routeId === id) count++;
    this.economy.spend(-count * vt.price * 0.5);
    this.net.deleteRoute(id);
    // orphaned non-legacy stops are cleaned up
    this.net.stops.forEach((s, sid) => {
      if (s && !s.legacy && s.routes.length === 0) this.net.stops[sid] = null;
    });
    this.net.rebuildStopGrid();
    if (this.selectedRoute === id) this.selectedRoute = -1;
    this.bump();
  }

  /* ----------------------------------------------------------- commands */

  setSpeed(idx: number): void {
    this.speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, idx));
    this.bump();
  }

  setTool(tool: Tool): void {
    if (tool !== this.tool) this.cancelDraft();
    this.tool = tool;
    if (tool === 'busRoute') this.startDraft('bus');
    if (tool === 'tramRoute') this.startDraft('tram');
    if (tool === 'tubeLine') this.startDraft('tube');
    if (tool === 'boatRoute') this.startDraft('boat');
    this.bump();
  }

  setOverlay(o: Overlay): void {
    this.overlay = o;
    this.bump();
  }

  setVehicles(routeId: number, target: number): void {
    const r = this.net.routes[routeId];
    if (!r) return;
    r.vehiclesTarget = Math.max(0, Math.min(40, Math.round(target)));
    const cost = this.net.syncFleets();
    if (cost > 0 && !this.economy.spend(cost)) {
      // revert if unaffordable
      r.vehiclesTarget = 0;
      for (const v of this.net.vehicles.values()) if (v.routeId === routeId) r.vehiclesTarget++;
    } else if (cost < 0) {
      this.economy.spend(cost);
    }
    this.net.graphDirty = true;
    this.bump();
  }

  setVehicleType(routeId: number, typeId: string): void {
    const r = this.net.routes[routeId];
    if (!r || r.legacy) return;
    const vt = vehicleType(typeId);
    if (vt.mode !== r.mode) return;
    // swap fleet: sell old at half, buy new
    let count = 0;
    for (const [vid, v] of [...this.net.vehicles]) {
      if (v.routeId === routeId) {
        count++;
        this.net.vehicles.delete(vid);
      }
    }
    const old = vehicleType(r.vehicleType);
    const cost = count * vt.price - count * old.price * 0.5;
    if (!this.economy.spend(cost)) return;
    r.vehicleType = typeId;
    this.net.syncFleets();
    this.net.graphDirty = true;
    this.bump();
  }

  setFare(mode: Mode, value: number): void {
    this.economy.fares[mode] = Math.max(0, Math.min(12, value));
    this.net.graphDirty = true;
    this.bump();
  }

  setPolicy(key: 'congestionCharge' | 'advertising', value: boolean): void {
    this.economy.policies[key] = value;
    this.bump();
  }

  setBikeShare(level: 0 | 1 | 2 | 3): void {
    const cur = this.economy.policies.bikeShare;
    if (level > cur && !this.economy.spend((level - cur) * 20_000_000)) return;
    this.economy.policies.bikeShare = level;
    this.bump();
  }

  takeLoan(amount: number): void {
    if (this.economy.takeLoan(amount)) this.events.push(`Loan drawn: £${(amount / 1e6).toFixed(0)}m`, this.minute);
    this.bump();
  }

  repayLoan(amount: number): void {
    this.economy.repayLoan(amount);
    this.bump();
  }

  toggleRouteActive(routeId: number): void {
    const r = this.net.routes[routeId];
    if (!r) return;
    r.active = !r.active;
    this.net.graphDirty = true;
    this.bump();
  }

  /* ------------------------------------------------------------ persist */

  toSave(): SaveGame {
    return {
      version: SAVE_VERSION,
      seed: this.seed,
      difficulty: this.difficulty,
      minute: this.minute,
      cash: this.economy.cash,
      loan: this.economy.loan,
      fares: { ...this.economy.fares },
      policies: { ...this.economy.policies },
      weather: { ...this.weather },
      stops: this.net.stops
        .map((s) => s)
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({ id: s.id, mode: s.mode, p: s.p, nodeId: s.nodeId, name: s.name, legacy: s.legacy })),
      routes: this.net.routes
        .filter((r): r is Route => !!r)
        .map((r) => ({
          id: r.id,
          mode: r.mode,
          name: r.name,
          color: r.color,
          stops: r.stops,
          circular: r.circular,
          vehicleType: r.vehicleType,
          vehiclesTarget: r.vehiclesTarget,
          active: r.active,
          legacy: r.legacy,
          crowding: r.crowding,
        })),
      nextStopId: this.net.stops.length,
      nextRouteId: this.net.routes.length,
      history: this.history.history,
      achievements: [...this.achievementsUnlocked],
      happiness: this.agents.happiness,
      carShare: this.agents.carShare,
      cameraX: this.camera.x,
      cameraY: this.camera.y,
      cameraZoom: this.camera.zoom,
    };
  }

  private restore(save: SaveGame): void {
    this.minute = save.minute;
    this.weather = save.weather;
    this.economy.cash = save.cash;
    this.economy.loan = save.loan;
    this.economy.fares = { ...save.fares };
    this.economy.policies = { ...save.policies };
    this.history.history = save.history;
    this.achievementsUnlocked = new Set(save.achievements);
    this.agents.happiness = save.happiness;
    this.agents.carShare = save.carShare;
    this.camera = { x: save.cameraX, y: save.cameraY, zoom: save.cameraZoom };

    // Recreate stops preserving ids (array may be sparse).
    for (const s of save.stops) {
      while (this.net.stops.length < s.id) this.net.stops.push(null);
      this.net.stops.push({
        id: s.id,
        mode: s.mode,
        p: s.p,
        nodeId: s.nodeId,
        name: s.name,
        routes: [],
        closedUntil: 0,
        legacy: s.legacy,
      });
    }
    this.net.rebuildStopGrid();

    for (const r of save.routes) {
      while (this.net.routes.length < r.id) this.net.routes.push(null);
      // Rebuild geometry from stops (map is deterministic per seed).
      let path: Vec[] = [];
      const stopPts = r.stops.map((sid) => this.net.stops[sid]!.p);
      if (r.mode === 'bus' || r.mode === 'tram') {
        for (let i = 1; i < r.stops.length; i++) {
          const a = this.net.stops[r.stops[i - 1]]!;
          const b = this.net.stops[r.stops[i]]!;
          const nodes = roadPath(this.map, a.nodeId, b.nodeId);
          if (nodes) for (let k = i === 1 ? 0 : 1; k < nodes.length; k++) path.push(this.map.nodes[nodes[k]].p);
        }
        if (r.circular && r.stops.length > 1) {
          const nodes = roadPath(this.map, this.net.stops[r.stops[r.stops.length - 1]]!.nodeId, this.net.stops[r.stops[0]]!.nodeId);
          if (nodes) for (let k = 1; k < nodes.length; k++) path.push(this.map.nodes[nodes[k]].p);
        }
      } else if (r.mode === 'tube') {
        const pts = r.circular ? [...stopPts, stopPts[0]] : stopPts;
        path = resample(pts, 140);
      } else {
        path = resample(stopPts, 120); // boats: simple line restore
      }
      if (path.length < 2) path = stopPts.length >= 2 ? stopPts : [...stopPts, ...stopPts];
      const route = this.net.createRoute(r.mode, r.name, r.stops, path, r.circular, r.vehicleType);
      route.color = r.color;
      route.vehiclesTarget = r.vehiclesTarget;
      route.active = r.active;
      route.legacy = r.legacy;
      route.crowding = r.crowding;
      // Saved routes are restored in ascending id order onto padded slots,
      // so createRoute's id (routes.length at call time) always equals r.id.
      this.routeCounters[r.mode]++;
    }
    this.net.syncFleets();
  }

  /* ----------------------------------------------------------- snapshot */

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private bump(): void {
    this.version++;
    this.snapshotCache = null;
    for (const cb of this.listeners) cb();
  }

  getSnapshot = (): UISnapshot => {
    if (this.snapshotCache) return this.snapshotCache;
    const day = Math.floor(this.minute / MIN_PER_DAY);
    const mod = this.minute % MIN_PER_DAY;
    const h = Math.floor(mod / 60);
    const m = Math.floor(mod % 60);
    const date = dayToDate(day);
    const vehicleCount = this.net.vehicles.size;
    this.snapshotCache = {
      minute: this.minute,
      day,
      timeLabel: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      dateLabel: `${WEEKDAYS[day % 7]} ${date.d} ${MONTHS[date.m]} ${date.y}`,
      speed: this.speedIdx,
      cash: this.economy.sandbox ? Infinity : this.economy.cash,
      loan: this.economy.loan,
      weather: this.weather.kind,
      temp: this.weather.temp,
      happiness: this.agents.happiness,
      rating: ratingOf(this.agents.happiness),
      activeAgents: this.agents.agents.size,
      passengersToday: this.agents.boardingsToday,
      congestion: this.congestion,
      routeCount: this.net.routes.filter(Boolean).length,
      vehicleCount,
      news: [...this.events.news],
      tool: this.tool,
      overlay: this.overlay,
      draft: this.draft ? { ...this.draft } : null,
      selectedRoute: this.selectedRoute,
      selectedStop: this.selectedStop,
      fares: { ...this.economy.fares },
      policies: { ...this.economy.policies },
      difficulty: this.difficulty,
      history: this.history.history,
      achievements: [...this.achievementsUnlocked],
      gameOver: this.gameOver,
    };
    return this.snapshotCache;
  };
}

/* --------------------------------------------------------------- helpers */

function defaultVehicleFor(mode: Mode): string {
  if (mode === 'bus') return 'busDouble';
  if (mode === 'tram') return 'tram';
  if (mode === 'tube') return 'tubeTrain';
  return 'riverBoat';
}

function ratingOf(h: number): string {
  if (h >= 85) return 'Outstanding';
  if (h >= 72) return 'Good';
  if (h >= 58) return 'Adequate';
  if (h >= 45) return 'Poor';
  return 'Failing';
}

/** UK-ish school holidays by day-of-year. */
function isSchoolHoliday(day: number): boolean {
  const doy = day % 365;
  return (
    (doy >= 355 || doy < 4) || // Christmas
    (doy >= 100 && doy < 114) || // Easter
    (doy >= 205 && doy < 245) || // Summer
    (doy >= 295 && doy < 302) // half term
  );
}

function dayToDate(day: number): { d: number; m: number; y: number } {
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let y = 2026;
  let rem = day;
  for (;;) {
    const len = 365;
    if (rem < len) break;
    rem -= len;
    y++;
  }
  let m = 0;
  while (rem >= DAYS[m]) {
    rem -= DAYS[m];
    m++;
  }
  return { d: rem + 1, m, y };
}

/** Slice a polyline between two distances (either direction). */
function sliceAlong(pts: Vec[], cum: number[], s0: number, s1: number): Vec[] {
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  const out: Vec[] = [];
  // point at lo
  out.push(pointOn(pts, cum, lo));
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] > lo && cum[i] < hi) out.push(pts[i]);
  }
  out.push(pointOn(pts, cum, hi));
  if (s0 > s1) out.reverse();
  return out;
}

function pointOn(pts: Vec[], cum: number[], s: number): Vec {
  if (s <= 0) return { ...pts[0] };
  const total = cum[cum.length - 1];
  if (s >= total) return { ...pts[pts.length - 1] };
  let i = 1;
  while (cum[i] < s) i++;
  const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return {
    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
  };
}
