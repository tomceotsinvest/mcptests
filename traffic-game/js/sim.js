/* ============ GRIDLOCK — traffic simulation engine ============ */
'use strict';
(function (TG) {
  const { M, RNG } = TG;

  const VEH_TYPES = {
    car:       { len: 4.4, accel: 2.4, decel: 4.5, speedMul: 1.0, co2: 1.0, colors: ['#e8e6e3', '#c9d4e4', '#d4b8b8', '#b8c9b8', '#e4d9c0', '#9db4d0', '#d0a8a8', '#8899aa'] },
    van:       { len: 5.8, accel: 1.9, decel: 4.0, speedMul: 0.96, co2: 1.6, colors: ['#d8d8d8', '#c0c8d8', '#d8ccb0'] },
    truck:     { len: 9.5, accel: 1.2, decel: 3.2, speedMul: 0.85, co2: 3.2, colors: ['#a8b0b8', '#b8a890', '#90a8b8'] },
    bus:       { len: 11.5, accel: 1.4, decel: 3.4, speedMul: 0.92, co2: 2.6, colors: ['#e5484d'] },
    tram:      { len: 21, accel: 1.2, decel: 2.8, speedMul: 0.9, co2: 0.4, colors: ['#30a46c'] },
    emergency: { len: 6.2, accel: 3.2, decel: 5.5, speedMul: 1.35, co2: 1.4, colors: ['#ffffff'] },
    taxi:      { len: 4.5, accel: 2.4, decel: 4.5, speedMul: 1.0, co2: 1.1, colors: ['#f0c53d'] }
  };

  const WEATHERS = {
    sunny:     { icon: '☀️', name: 'Sunny',       speed: 1.0,  accident: 1.0, demand: 1.0, vis: 1.0 },
    cloudy:    { icon: '⛅', name: 'Cloudy',      speed: 1.0,  accident: 1.0, demand: 1.0, vis: 1.0 },
    rain:      { icon: '🌧', name: 'Rain',        speed: 0.88, accident: 1.7, demand: 1.06, vis: 0.9 },
    heavyrain: { icon: '⛈', name: 'Heavy rain',  speed: 0.72, accident: 2.6, demand: 1.1, vis: 0.75 },
    fog:       { icon: '🌫', name: 'Fog',         speed: 0.7,  accident: 2.2, demand: 0.95, vis: 0.55 },
    snow:      { icon: '🌨', name: 'Snow',        speed: 0.62, accident: 2.8, demand: 0.85, vis: 0.8 },
    ice:       { icon: '🧊', name: 'Icy roads',   speed: 0.55, accident: 4.0, demand: 0.8, vis: 0.95 }
  };
  const WEATHER_CHAIN = {
    sunny: ['sunny', 'sunny', 'cloudy'], cloudy: ['cloudy', 'sunny', 'rain', 'fog'],
    rain: ['rain', 'cloudy', 'heavyrain'], heavyrain: ['rain', 'cloudy'],
    fog: ['cloudy', 'fog'], snow: ['snow', 'ice', 'cloudy'], ice: ['snow', 'cloudy']
  };

  const DIFFICULTY = {
    easy:   { demand: 0.75, budgetMul: 1.6, smart: 0.3, patience: 1.5, taxMul: 1.2 },
    normal: { demand: 1.0,  budgetMul: 1.0, smart: 0.6, patience: 1.0, taxMul: 1.0 },
    hard:   { demand: 1.3,  budgetMul: 0.7, smart: 0.85, patience: 0.75, taxMul: 0.9 },
    expert: { demand: 1.6,  budgetMul: 0.5, smart: 1.0, patience: 0.55, taxMul: 0.8 }
  };

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function Sim(city, opts) {
    opts = opts || {};
    const diff = DIFFICULTY[opts.difficulty || 'normal'];
    const rng = RNG(opts.seed || 777);

    const sim = {
      city, net: city.net, zones: city.zones,
      transit: TG.TransitSystem(city.net),
      diff, difficulty: opts.difficulty || 'normal',
      sandbox: !!opts.sandbox,
      rng,

      time: 6.8 * 3600,          // seconds since midnight
      day: 1, speed: 1, paused: false,
      weather: 'sunny', weatherUntil: 0,

      vehicles: [], freeVehicles: [],
      activeEdges: new Set(),
      maxVehicles: opts.maxVehicles || 2200,

      demandFactor: 1,
      budget: Math.round((opts.budget || 250000) * diff.budgetMul),
      unlimitedMoney: !!opts.sandbox,

      accidents: [], events: [], notifications: [],
      trains: [],

      stats: {
        tripsCompleted: 0, tripsFailed: 0, tripsTotal: 0,
        transitTrips: 0, bikeTrips: 0, walkTrips: 0,
        travelTimeSum: 0, delaySum: 0, freeTimeSum: 0,
        co2Today: 0, co2Rate: 0,
        happiness: 0.7, avgCongestion: 0, avgSpeedNow: 0,
        incomeToday: 0, expenseToday: 0,
        history: [],                     // sampled every 10 sim-min
        maxHistory: 400
      },
      score: 0, scoreParts: {},
      spawnAcc: 0, emitAcc: 0,
      _lastStatT: 0, _lastDayTick: 0,
      onNotify: null, onDayEnd: null
    };

    sim.population = () => {
      let p = 0;
      for (const z of sim.zones) p += z.pop;
      return p;
    };

    /* ================= TIME & PHASES ================= */
    sim.hour = () => (sim.time / 3600) % 24;
    sim.isWeekend = () => ((sim.day - 1) % 7) >= 5;
    sim.dayName = () => DAYS[(sim.day - 1) % 7];
    sim.phaseName = function () {
      const h = sim.hour();
      if (h < 5.5) return 'Night';
      if (h < 7) return 'Early morning';
      if (h < 9.5) return sim.isWeekend() ? 'Lazy morning' : 'Morning rush';
      if (h < 11.5) return 'School run done';
      if (h < 14) return 'Lunch traffic';
      if (h < 16) return 'Afternoon';
      if (h < 19) return sim.isWeekend() ? 'Evening' : 'Evening rush';
      if (h < 22.5) return 'Evening';
      return 'Night';
    };

    /* ================= DEMAND MODEL ================= */
    function curveCommuteOut(h) { return gauss(h, 8.1, 1.0) * 1.6 + gauss(h, 13.5, 3) * 0.06; }
    function curveCommuteBack(h) { return gauss(h, 17.3, 1.15) * 1.5 + gauss(h, 12.6, 1.2) * 0.15; }
    function curveSchool(h) { return gauss(h, 8.4, 0.45) * 1.4 + gauss(h, 15.4, 0.5) * 1.2; }
    function curveShopping(h) { return gauss(h, 12.5, 2.2) * 0.7 + gauss(h, 18.5, 2) * 0.7; }
    function curveFreight(h) { return (h > 5.5 && h < 19) ? 0.55 : 0.12; }
    function curveLeisure(h) { return gauss(h, 20.5, 2.2) * 0.9 + gauss(h, 14, 3) * 0.2; }
    function gauss(x, mu, sig) { const d = (x - mu) / sig; return Math.exp(-0.5 * d * d); }

    const zonesByType = {};
    sim.reindexZones = function () {
      for (const k of Object.keys(zonesByType)) delete zonesByType[k];
      for (const z of sim.zones) {
        if (!z.anchors || !z.anchors.length) continue;
        (zonesByType[z.type] = zonesByType[z.type] || []).push(z);
      }
    };
    sim.reindexZones();

    function pickZone(types) {
      const cands = [];
      for (const t of types) if (zonesByType[t]) cands.push(...zonesByType[t]);
      if (!cands.length) return null;
      return cands[Math.floor(rng.next() * cands.length)];
    }
    /** Gravity model: prefer nearer destinations (people don't commute across town if they can help it). */
    function pickZoneNear(types, ref) {
      const cands = [];
      for (const t of types) if (zonesByType[t]) cands.push(...zonesByType[t]);
      if (!cands.length) return null;
      if (!ref) return cands[Math.floor(rng.next() * cands.length)];
      let tot = 0;
      const ws = cands.map(z => {
        const d = M.dist(ref.cx, ref.cy, z.cx, z.cy);
        const w = (1 + (z.jobs || z.pop || 50) / 500) / (1 + Math.pow(d / 700, 2));
        tot += w; return w;
      });
      let r = rng.next() * tot;
      for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i]; }
      return cands[cands.length - 1];
    }
    function popWeightedRes() {
      const rs = zonesByType.residential;
      if (!rs || !rs.length) return null;
      let tot = 0;
      for (const z of rs) tot += z.pop + 50;
      let r = rng.next() * tot;
      for (const z of rs) { r -= z.pop + 50; if (r <= 0) return z; }
      return rs[rs.length - 1];
    }

    sim.tripRate = function () {   // trips per sim-second
      const h = sim.hour(), we = sim.isWeekend();
      const schoolHol = sim.events.some(e => e.kind === 'schoolHoliday' && e.active);
      let mix =
        curveCommuteOut(h) * (we ? 0.25 : 1) +
        curveCommuteBack(h) * (we ? 0.25 : 1) +
        curveSchool(h) * (we || schoolHol ? 0 : 0.5) +
        curveShopping(h) * (we ? 1.5 : 0.8) +
        curveFreight(h) * 0.4 +
        curveLeisure(h) * (we ? 1.3 : 0.7) + 0.05;
      const perDayPerPerson = 2.1;
      const base = sim.population() * perDayPerPerson / 86400;
      let evFactor = 1;
      for (const e of sim.events) if (e.active && e.demandMul) evFactor *= e.demandMul;
      // peak spreading: when the network is visibly jammed, some people postpone travel
      const suppress = 1 - 0.55 * M.clamp((sim.stats.avgCongestion - 0.45) / 0.4, 0, 1);
      return base * mix * 1.9 * suppress * diff.demand * sim.demandFactor * WEATHERS[sim.weather].demand * evFactor;
    };

    function choosePurpose(h, we) {
      const schoolHol = sim.events.some(e => e.kind === 'schoolHoliday' && e.active);
      const ws = [
        ['commuteOut', curveCommuteOut(h) * (we ? 0.25 : 1)],
        ['commuteBack', curveCommuteBack(h) * (we ? 0.25 : 1)],
        ['school', curveSchool(h) * (we || schoolHol ? 0 : 0.5)],
        ['shopping', curveShopping(h) * (we ? 1.5 : 0.8)],
        ['freight', curveFreight(h) * 0.4],
        ['leisure', curveLeisure(h) * (we ? 1.3 : 0.7)]
      ];
      let tot = 0.0001;
      for (const w of ws) tot += w[1];
      let r = rng.next() * tot;
      for (const w of ws) { r -= w[1]; if (r <= 0) return w[0]; }
      return 'shopping';
    }

    const JOB_TYPES = ['office', 'commercial', 'industrial', 'retail', 'hospital', 'station', 'school'];
    function tripEndpoints(purpose) {
      let oz = null, dz = null;
      switch (purpose) {
        case 'commuteOut': oz = popWeightedRes(); dz = pickZoneNear(JOB_TYPES, oz); break;
        case 'commuteBack': oz = pickZone(JOB_TYPES); dz = pickZoneNear(['residential'], oz); break;
        case 'school': oz = popWeightedRes(); dz = pickZoneNear(['school'], oz) || pickZoneNear(JOB_TYPES, oz); break;
        case 'shopping': {
          const back = rng.chance(0.45);
          const home = popWeightedRes();
          const shop = pickZoneNear(['retail', 'commercial'], home) || pickZoneNear(JOB_TYPES, home);
          oz = back ? shop : home; dz = back ? home : shop;
          break;
        }
        case 'freight': oz = pickZone(['industrial']) || popWeightedRes(); dz = pickZone(['commercial', 'retail', 'industrial', 'office']) || popWeightedRes(); break;
        case 'leisure': {
          const back = rng.chance(0.4);
          const home = popWeightedRes();
          const fun = pickZoneNear(['park', 'stadium', 'commercial', 'retail'], home) || home;
          oz = back ? fun : home; dz = back ? home : fun;
          break;
        }
      }
      // event-driven destination override (matches, concerts)
      for (const e of sim.events) {
        if (e.active && e.attract && rng.chance(e.attractP)) {
          if (e.phase === 'in') { dz = e.zone || dz; }
          else { oz = e.zone || oz; dz = popWeightedRes() || dz; }
        }
      }
      if (!oz || !dz || oz === dz) return null;
      const on = oz.anchors[Math.floor(rng.next() * oz.anchors.length)];
      const dn = dz.anchors[Math.floor(rng.next() * dz.anchors.length)];
      if (!on || !dn || on === dn) return null;
      return { on, dn, oz, dz, purpose };
    }

    /* ================= MODE CHOICE ================= */
    let cycleLaneKm = 0;
    sim.recountLanes = function () {
      cycleLaneKm = 0;
      for (const r of sim.net.roads.values()) if (r.cycleLane) cycleLaneKm += r.len / 1000;
    };
    sim.recountLanes();

    function chooseMode(ep) {
      const a = sim.net.nodes.get(ep.on), b = sim.net.nodes.get(ep.dn);
      if (!a || !b) return null;
      const dist = M.dist(a.x, a.y, b.x, b.y);
      if (dist < 260 && rng.chance(0.55)) return { mode: 'walk' };
      // cycling: needs lanes/bike hire, short-ish trips
      const bikeAppeal = Math.min(0.5, cycleLaneKm * 0.02 + (sim.transit.facilityNear(a.x, a.y, 'bikeshare') ? 0.25 : 0));
      if (dist < 2600 && sim.weather !== 'heavyrain' && sim.weather !== 'snow' && sim.weather !== 'ice' && rng.chance(bikeAppeal)) return { mode: 'bike' };
      // transit
      const est = sim.transit.estimate(ep.on, ep.dn);
      if (est) {
        const carEst = dist / 7.5 + 70 + sim.stats.avgCongestion * dist / 6;
        if (est.time < carEst * (1.05 + 0.3 * rng.next())) return { mode: 'transit', est };
      }
      // park & ride: long car trip toward centre with facility available
      if (dist > 1400) {
        const pr = sim.transit.facilityNear(b.x, b.y, 'parkride') ? null : findParkRideBetween(a, b);
        if (pr && rng.chance(0.35)) return { mode: 'car', parkride: pr };
      }
      return { mode: 'car' };
    }
    function findParkRideBetween(a, b) {
      for (const f of sim.transit.facilities) {
        if (f.type !== 'parkride' || !f.nodeId) continue;
        const dOA = M.dist(a.x, a.y, f.x, f.y), dOB = M.dist(f.x, f.y, b.x, b.y);
        const direct = M.dist(a.x, a.y, b.x, b.y);
        if (dOA + dOB < direct * 1.3 && dOA > direct * 0.3) {
          const destNode = sim.net.nearestNode(b.x, b.y, 300);
          if (destNode && sim.transit.estimate(f.nodeId, destNode.id)) return f;
        }
      }
      return null;
    }

    /* ================= VEHICLES ================= */
    let _vid = 1;
    function acquireVehicle() {
      let v = sim.freeVehicles.pop();
      if (!v) { v = { id: _vid++ }; sim.vehicles.push(v); }
      v.active = true;
      return v;
    }
    function releaseVehicle(v) {
      if (v.edgeObj) removeFromEdge(v.edgeObj, v);
      v.active = false; v.edgeObj = null; v.route = null; v.line = null;
      sim.freeVehicles.push(v);
    }
    sim.activeVehicleCount = () => sim.vehicles.length - sim.freeVehicles.length;

    function removeFromEdge(e, v) {
      const i = e.vehicles.indexOf(v);
      if (i >= 0) e.vehicles.splice(i, 1);
      if (!e.vehicles.length) sim.activeEdges.delete(e);
    }
    function pushToEdge(e, v, pos) {
      v.edgeObj = e; v.pos = pos || 0;
      e.vehicles.push(v);       // entering at start → smallest pos → last in desc-sorted array
      sim.activeEdges.add(e);
    }

    /** Space available at the entry of edge e for lane. */
    function entrySpace(e, lane, needLen) {
      // scan from back (lowest pos)
      for (let i = e.vehicles.length - 1; i >= 0; i--) {
        const w = e.vehicles[i];
        if (w.lane !== lane) continue;
        return w.pos - w.len > needLen + 1.5;
      }
      return true;
    }
    function pickEntryLane(e, v) {
      const r = sim.net.roads.get(e.road);
      if (!r) return 0;
      if ((v.type === 'bus' || v.type === 'tram' || v.type === 'emergency') && r.busLane) return -1; // dedicated
      const lanes = Math.max(1, r.lanes - (r.roadworks > 0 ? 1 : 0));
      let best = -2, bestSpace = -1;
      for (let l = 0; l < lanes; l++) {
        let minPos = Infinity;
        for (let i = e.vehicles.length - 1; i >= 0; i--) {
          const w = e.vehicles[i];
          if (w.lane === l) { minPos = w.pos - w.len; break; }
        }
        if (minPos === Infinity) minPos = e.len;
        if (minPos > bestSpace) { bestSpace = minPos; best = l; }
      }
      return best === -2 ? 0 : best;
    }

    function spawnCar(ep, mode, typeName) {
      // at the vehicle cap, demand is suppressed silently (not a failed trip)
      if (sim.activeVehicleCount() >= sim.maxVehicles) return null;
      let destNode = ep.dn;
      if (mode.parkride) destNode = mode.parkride.nodeId;
      const smart = rng.next() < diff.smart;
      const route = sim.net.route(ep.on, destNode, { smart, ltnOk: isLtnTrip(ep) });
      if (!route || !route.length) { sim.stats.tripsFailed++; return null; }
      const firstEdge = sim.net.edges.get(route[0]);
      if (!firstEdge) return null;
      const v = acquireVehicle();
      const T = VEH_TYPES[typeName];
      v.type = typeName; v.len = T.len;
      v.color = T.colors[Math.floor(rng.next() * T.colors.length)];
      v.route = route; v.ri = 0;
      v.destNode = destNode; v.originNode = ep.on;
      v.spawnT = sim.time + sim.day * 86400;
      v.freeT = freeFlowTime(route);
      v.patience = (240 + rng.next() * 600) * diff.patience;
      v.vel = 0; v.stoppedUntil = 0; v.stopWait = 0; v.crossed = false;
      v.netVersion = sim.net.version;
      v.rerouteAt = sim.time + 15 + rng.next() * 25;
      v.emergency = typeName === 'emergency';
      v.line = null; v.frustrated = false; v.parkride = !!mode.parkride;
      v.lane = pickEntryLane(firstEdge, v);
      // no kerb space to pull out: trip simply doesn't start (suppressed, not failed)
      if (!entrySpace(firstEdge, v.lane, v.len)) { releaseVehicle(v); return null; }
      pushToEdge(firstEdge, v, 0);
      sim.stats.tripsTotal++;
      return v;
    }
    function isLtnTrip(ep) {
      const check = (nid) => {
        const n = sim.net.nodes.get(nid);
        if (!n) return false;
        for (const eid of n.out) {
          const e = sim.net.edges.get(eid), r = e && sim.net.roads.get(e.road);
          if (r && r.ltn) return true;
        }
        return false;
      };
      return check(ep.on) || check(ep.dn);
    }
    function freeFlowTime(route) {
      let t = 0;
      for (const eid of route) {
        const e = sim.net.edges.get(eid);
        if (!e) continue;
        const r = sim.net.roads.get(e.road);
        t += e.len / (r ? r.speed : 13);
      }
      return t;
    }

    sim.spawnTrip = function () {
      const h = sim.hour(), we = sim.isWeekend();
      const purpose = choosePurpose(h, we);
      const ep = tripEndpoints(purpose);
      if (!ep) return;
      const mode = chooseMode(ep);
      if (!mode) return;
      if (mode.mode === 'walk') { sim.stats.walkTrips++; sim.stats.tripsTotal++; sim.stats.tripsCompleted++; return; }
      if (mode.mode === 'bike') { sim.stats.bikeTrips++; sim.stats.tripsTotal++; sim.stats.tripsCompleted++; return; }
      if (mode.mode === 'transit') {
        sim.stats.transitTrips++; sim.stats.tripsTotal++; sim.stats.tripsCompleted++;
        for (const line of mode.est.lines) { line.ridersToday++; line.ridersTotal++; }
        return;
      }
      let typeName = 'car';
      if (purpose === 'freight') typeName = rng.chance(0.5) ? 'truck' : 'van';
      else if (rng.chance(0.04) && sim.transit.facilities.some(f => f.type === 'taxirank')) typeName = 'taxi';
      spawnCar(ep, mode, typeName);
      if (mode.parkride) { sim.stats.transitTrips++; }
    };

    /* ================= TRANSIT VEHICLES ================= */
    sim.syncTransitVehicles = function () {
      for (const line of sim.transit.lines) {
        if (line.netVersion !== sim.net.version && TG.LINE_TYPES[line.type].onRoad) sim.transit.recomputeLinePath(line);
        const want = TG.LINE_TYPES[line.type].onRoad
          ? M.clamp(Math.round(line.totalLen / (line.speed * line.headway)), 1, 8) : 0;
        while (line.vehicles.length < want) {
          const v = acquireVehicle();
          const T = VEH_TYPES[line.type === 'tram' ? 'tram' : 'bus'];
          v.type = line.type === 'tram' ? 'tram' : 'bus';
          v.len = T.len; v.color = line.color;
          v.line = line; v.lineIdx = Math.floor(rng.next() * Math.max(1, line.path.length));
          v.route = null; v.vel = 0; v.lane = 0; v.stoppedUntil = 0; v.stopWait = 0;
          v.dwellUntil = 0; v.emergency = false; v.frustrated = false;
          const e = sim.net.edges.get(line.path[v.lineIdx]);
          if (e) { v.lane = pickEntryLane(e, v); pushToEdge(e, v, 0); }
          else { releaseVehicle(v); break; }
          line.vehicles.push(v);
        }
        while (line.vehicles.length > Math.max(want, 0)) {
          releaseVehicle(line.vehicles.pop());
        }
      }
      // cull vehicles of removed lines
      for (const v of sim.vehicles) {
        if (v.active && v.line && !sim.transit.lines.includes(v.line)) releaseVehicle(v);
      }
    };

    /* ================= MOVEMENT ================= */
    function nextEdgeFor(v) {
      if (v.line) {
        const line = v.line;
        if (!line.path.length) return null;
        v.lineIdx = (v.lineIdx + 1) % line.path.length;
        return sim.net.edges.get(line.path[v.lineIdx]) || null;
      }
      if (!v.route || v.ri + 1 >= v.route.length) return null;
      return sim.net.edges.get(v.route[v.ri + 1]) || null;
    }

    function canCross(v, e, node, dt) {
      // rail crossing closed?
      if (node.railClosedUntil && sim.time < node.railClosedUntil) return false;
      if (v.emergency) { node.busyUntil = sim.time + 0.5; return true; }
      switch (node.control) {
        case 'lights': {
          const g = sim.net.greenPhase(node, sim.time);
          const mine = node.phaseOf ? node.phaseOf.get(e.id) : 0;
          if (g === -1 || (mine !== undefined && mine !== g)) return false;
          return true;
        }
        case 'stop':
          if (v.vel > 0.3) return false;               // must fully stop first
          v.stopWait += dt;
          if (v.stopWait < 0.9) return false;
          if (sim.time < (node.busyUntil || 0)) return false;
          node.busyUntil = sim.time + 1.6;
          v.stopWait = 0;
          return true;
        case 'roundabout':
          if (sim.time < (node.busyUntil || 0)) return false;
          node.busyUntil = sim.time + 0.9;
          return true;
        default:
          // uncontrolled: brief conflict spacing
          if (sim.time < (node.busyUntil || 0) && v.vel < 1) return false;
          node.busyUntil = sim.time + 0.55;
          return true;
      }
    }

    function updateEdge(e, dt) {
      const r = sim.net.roads.get(e.road);
      if (!r) { for (const v of e.vehicles.slice()) teleportFinish(v); return; }
      const wf = WEATHERS[sim.weather].speed;
      const roadSpeed = r.speed * wf;
      const endNode = sim.net.nodes.get(e.to);
      const leaders = {};                       // lane → previous vehicle
      let speedSum = 0, n = 0;

      for (let i = 0; i < e.vehicles.length; i++) {
        const v = e.vehicles[i];
        if (v._tick === sim._tickId) { leaders[v.lane] = v; continue; }
        v._tick = sim._tickId;

        const T = VEH_TYPES[v.type];
        let target = roadSpeed * T.speedMul;
        if (r.crossing) target = Math.min(target, roadSpeed * 0.8);
        if (r.roadworks > 0) target *= 0.5;

        // accident / breakdown frozen
        if (v.stoppedUntil > sim.time) { leaders[v.lane] = v; speedSum += 0; n++; v.vel = 0; continue; }

        // headway to leader in same lane
        const lead = leaders[v.lane];
        let maxPos = e.len + 100;
        if (lead) maxPos = lead.pos - lead.len - 1.6;

        // junction constraint at edge end
        let mustStopAtEnd = false;
        if (v.pos > e.len - Math.max(14, v.vel * 3)) {
          const ne = nextEdgeFor(v);
          if (ne === null && !v.line) {
            // arrived at destination
            if (v.pos >= e.len - 2) { finishTrip(v); i--; continue; }
          } else if (ne) {
            const crossOk = canCross(v, e, endNode, dt);
            const lane = v._nextLane !== undefined && v._nextEdge === ne ? v._nextLane : pickEntryLane(ne, v);
            v._nextLane = lane; v._nextEdge = ne;
            const space = entrySpace(ne, lane, v.len);
            if (!crossOk || !space) mustStopAtEnd = true;
            else if (v.pos >= e.len - 0.5) {
              // transfer
              removeFromEdge(e, v);
              v.lane = lane;
              pushToEdge(ne, v, 0);
              if (!v.line) v.ri++;
              v._tick = sim._tickId;
              v.stopWait = 0;
              i--;
              continue;
            }
          } else if (v.line) {
            // line path broken → respawn later
            releaseVehicle(v);
            const li = v.line ? v.line.vehicles.indexOf(v) : -1;
            if (li >= 0) v.line.vehicles.splice(li, 1);
            i--; continue;
          }
        }
        if (mustStopAtEnd) maxPos = Math.min(maxPos, e.len - 0.4);

        // bus stop dwell
        if (v.line && v.dwellUntil > sim.time) { v.vel = 0; leaders[v.lane] = v; n++; continue; }

        // kinematics
        const gap = maxPos - v.pos;
        let vTarget = target;
        const stopDist = (v.vel * v.vel) / (2 * T.decel) + 2;
        if (gap < stopDist) vTarget = Math.max(0, v.vel - T.decel * dt * 2);
        if (gap < 0.8) vTarget = 0;
        if (v.vel < vTarget) v.vel = Math.min(vTarget, v.vel + T.accel * dt);
        else v.vel = Math.max(vTarget, v.vel - T.decel * dt);
        v.pos = Math.min(maxPos < v.pos ? v.pos : maxPos, v.pos + v.vel * dt);
        if (gap <= 1.2) v.vel = 0;

        // bus stops at line stops (edge ends that are stops)
        if (v.line && v.pos >= e.len - 1 && v.line.stops.includes(e.to) && v.dwellUntil < sim.time - 30) {
          v.dwellUntil = sim.time + 12;
        }

        // frustration / rerouting
        if (!v.line) {
          const elapsed = sim.time + sim.day * 86400 - v.spawnT;
          const delay = elapsed - v.freeT;
          if (delay > v.patience && !v.frustrated) { v.frustrated = true; sim.stats.happiness = Math.max(0, sim.stats.happiness - 0.0004); }
          if (delay > v.patience * 2 && v.vel < 0.5 && rng.chance(dt * 0.02)) {
            // gives up entirely — drains hopeless gridlock
            sim.stats.tripsFailed++;
            releaseVehicle(v);
            i--; continue;
          }
          if (sim.time > v.rerouteAt) {
            v.rerouteAt = sim.time + 18 + rng.next() * 30;
            if (v.vel < roadSpeed * 0.4 || v.netVersion !== sim.net.version) tryReroute(v, e);
          }
        }

        speedSum += v.vel; n++;
        leaders[v.lane] = v;
      }

      // keep sorted (positions can only converge; cheap insertion sort for near-sorted)
      const arr = e.vehicles;
      for (let i = 1; i < arr.length; i++) {
        const v = arr[i];
        let j = i - 1;
        while (j >= 0 && arr[j].pos < v.pos) { arr[j + 1] = arr[j]; j--; }
        arr[j + 1] = v;
      }

      // measured speed smoothing + emissions
      const meas = n ? speedSum / n : roadSpeed;
      e.meas = meas;
      e.avgSpeed += (Math.max(meas, n > 2 ? meas : roadSpeed * 0.7) - e.avgSpeed) * 0.02;
      if (n) {
        const emit = n * dt * (0.4 + (meas < 2 ? 0.8 : 0));
        e.pollution = Math.min(60, e.pollution + emit * 0.05);
        e.noise = Math.min(60, e.noise + n * dt * (0.2 + meas * 0.04));
        sim.emitAcc += emit;
      }
    }

    function tryReroute(v, e) {
      const smart = rng.next() < (diff.smart + 0.2);
      if (!smart && v.netVersion === sim.net.version) return;
      const route = sim.net.route(e.to, v.destNode, { smart: true, ltnOk: false });
      if (route) {
        v.route = [e.id].concat(route);
        v.ri = 0;
        v.netVersion = sim.net.version;
      } else if (v.netVersion !== sim.net.version) {
        // destination unreachable now
        sim.stats.tripsFailed++;
        releaseVehicle(v);
      }
    }

    function finishTrip(v) {
      const elapsed = sim.time + sim.day * 86400 - v.spawnT;
      sim.stats.tripsCompleted++;
      sim.stats.travelTimeSum += elapsed;
      sim.stats.freeTimeSum += v.freeT;
      sim.stats.delaySum += Math.max(0, elapsed - v.freeT);
      const ratio = elapsed / Math.max(30, v.freeT);
      sim.stats.happiness = M.clamp(sim.stats.happiness + (ratio < 1.4 ? 0.00035 : ratio > 2.5 ? -0.0005 : -0.0001), 0, 1);
      releaseVehicle(v);
    }
    function teleportFinish(v) {
      if (v.line) {
        const li = v.line.vehicles.indexOf(v);
        if (li >= 0) v.line.vehicles.splice(li, 1);
      }
      releaseVehicle(v);
    }

    /* ================= ACCIDENTS & INCIDENTS ================= */
    sim.spawnAccident = function (edge, opts) {
      opts = opts || {};
      let target = null;
      if (edge && edge.vehicles.length) target = edge.vehicles[Math.floor(rng.next() * edge.vehicles.length)];
      if (!target) {
        // find any busy edge
        for (const e of sim.activeEdges) { if (e.vehicles.length > 1) { target = e.vehicles[0]; edge = e; break; } }
      }
      if (!target || target.line) return null;
      const dur = opts.duration || (120 + rng.next() * 300);
      target.stoppedUntil = sim.time + dur;
      target.vel = 0;
      const at = M.polyAt(edge.pts, M.clamp(target.pos, 0, edge.len));
      const acc = { id: Date.now() + Math.random(), edge: edge.id, road: edge.road, x: at.x, y: at.y, until: sim.time + dur, vehicle: target, breakdown: !!opts.breakdown, emergencySent: false };
      sim.accidents.push(acc);
      const road = sim.net.roads.get(edge.road);
      notify(opts.breakdown ? '🔧 Breakdown' : '💥 Accident', (opts.breakdown ? 'Vehicle broken down' : 'Crash') + ' on ' + (road && road.name ? road.name : 'a ' + (road ? road.type : 'road')) + '. Traffic is rerouting.', opts.breakdown ? 'warn' : 'bad', { x: at.x, y: at.y });
      // emergency response halves remaining time on arrival
      dispatchEmergency(acc);
      return acc;
    };

    function dispatchEmergency(acc) {
      const hosp = sim.city.pois.find(p => p.type === 'hospital');
      const e = sim.net.edges.get(acc.edge);
      if (!e) return;
      const fromNode = hosp ? (sim.net.nearestNode(hosp.x, hosp.y, 300) || randomNode()) : randomNode();
      if (!fromNode) return;
      const route = sim.net.route(fromNode.id, e.to, { smart: true, ltnOk: true });
      if (!route || !route.length) return;
      const v = acquireVehicle();
      const T = VEH_TYPES.emergency;
      v.type = 'emergency'; v.len = T.len; v.color = '#fff';
      v.route = route; v.ri = 0; v.destNode = e.to; v.originNode = fromNode.id;
      v.spawnT = sim.time + sim.day * 86400; v.freeT = freeFlowTime(route);
      v.patience = 1e9; v.vel = 0; v.stoppedUntil = 0; v.stopWait = 0;
      v.emergency = true; v.line = null; v.frustrated = false;
      v.targetAccident = acc;
      v.netVersion = sim.net.version; v.rerouteAt = sim.time + 30;
      const fe = sim.net.edges.get(route[0]);
      if (!fe) { releaseVehicle(v); return; }
      v.lane = pickEntryLane(fe, v);
      pushToEdge(fe, v, 0);
      acc.emergencySent = true;
    }

    function randomNode() {
      const ids = [...sim.net.nodes.keys()];
      if (!ids.length) return null;
      return sim.net.nodes.get(ids[Math.floor(rng.next() * ids.length)]);
    }

    sim.spawnRoadworks = function (road, durationH) {
      road.roadworks = sim.time + (durationH || 6) * 3600;
      notify('🚧 Roadworks', 'Works started on ' + (road.name || 'a ' + road.type) + ' — capacity halved.', 'warn', midOf(road));
      sim.net.version++;
    };
    function midOf(road) { const p = M.polyAt(road.pts, road.len / 2); return { x: p.x, y: p.y }; }

    /* ================= EVENTS ================= */
    const EVENT_DEFS = [
      { kind: 'match', name: '⚽ Football match', needs: 'stadium', hours: 3, attractP: 0.5, msg: 'Kick-off soon — heavy traffic expected around the stadium.' },
      { kind: 'concert', name: '🎤 Concert', needs: 'stadium', hours: 4, attractP: 0.4, msg: 'Concert tonight — expect crowds near the venue.' },
      { kind: 'festival', name: '🎪 Festival', needs: 'park', hours: 6, attractP: 0.3, msg: 'A street festival is drawing visitors to the park.' },
      { kind: 'schoolHoliday', name: '🏖 School holiday', hours: 24, msg: 'Schools are closed today — lighter morning traffic.' },
      { kind: 'flood', name: '🌊 Flooding', hours: 5, msg: 'Flooding! Bridges and riverside roads are closing.' },
      { kind: 'construction', name: '🏗 Construction project', hours: 12, msg: 'A construction project has closed lanes on a major road.' }
    ];

    sim.triggerEvent = function (kindOrNull) {
      const cands = EVENT_DEFS.filter(d => !kindOrNull || d.kind === kindOrNull);
      const def = cands[Math.floor(rng.next() * cands.length)];
      if (!def) return;
      let zone = null;
      if (def.needs) {
        const zs = sim.zones.filter(z => z.type === def.needs);
        if (!zs.length) return;
        zone = zs[Math.floor(rng.next() * zs.length)];
      }
      const ev = {
        kind: def.kind, name: def.name, zone,
        start: sim.time, until: sim.time + def.hours * 3600,
        active: true, phase: 'in',
        attract: !!def.attractP, attractP: def.attractP || 0,
        demandMul: def.kind === 'schoolHoliday' ? 0.9 : 1.15,
        closedRoads: []
      };
      if (def.kind === 'flood') {
        for (const r of sim.net.roads.values()) {
          if (r.bridge && rng.chance(0.6)) { r.closed = true; ev.closedRoads.push(r.id); }
        }
        sim.net.version++;
      }
      if (def.kind === 'construction') {
        const arts = [...sim.net.roads.values()].filter(r => r.type === 'arterial');
        if (arts.length) sim.spawnRoadworks(arts[Math.floor(rng.next() * arts.length)], def.hours);
      }
      sim.events.push(ev);
      notify(def.name, def.msg, 'warn', zone ? { x: zone.cx, y: zone.cy } : null);
    };

    function updateEvents() {
      for (const ev of sim.events) {
        if (!ev.active) continue;
        if (ev.attract && sim.time > (ev.start + ev.until) / 2) ev.phase = 'out';
        if (sim.time > ev.until) {
          ev.active = false;
          for (const rid of ev.closedRoads) {
            const r = sim.net.roads.get(rid);
            if (r) r.closed = false;
          }
          if (ev.closedRoads.length) sim.net.version++;
          notify(ev.name, 'The event has ended. Traffic returning to normal.', 'good');
        }
      }
      sim.events = sim.events.filter(ev => ev.active || sim.time - ev.until < 3600);
    }

    /* ================= WEATHER ================= */
    sim.cycleWeather = function (force) {
      const winter = false;
      let chain = WEATHER_CHAIN[sim.weather] || ['sunny'];
      if (force) {
        const keys = Object.keys(WEATHERS);
        sim.weather = keys[(keys.indexOf(sim.weather) + 1) % keys.length];
      } else {
        let next = chain[Math.floor(rng.next() * chain.length)];
        if ((next === 'snow' || next === 'ice') && !winter) next = 'rain';
        if (rng.chance(0.06)) next = 'snow';
        sim.weather = next;
      }
      sim.weatherUntil = sim.time + (2 + rng.next() * 5) * 3600;
      if (sim.weather !== 'sunny' && sim.weather !== 'cloudy') {
        notify(WEATHERS[sim.weather].icon + ' ' + WEATHERS[sim.weather].name, 'Drivers slow down; accident risk ' + (WEATHERS[sim.weather].accident > 2 ? 'greatly ' : '') + 'increased.', 'warn');
      }
    };

    /* ================= TRAINS (level crossings) ================= */
    function updateTrains(dt) {
      if (!sim.city.rail || !sim.city.rail.length) return;
      // spawn a train every ~4 min
      if (!sim._nextTrain) sim._nextTrain = sim.time + 60;
      if (sim.time > sim._nextTrain) {
        sim._nextTrain = sim.time + 180 + rng.next() * 240;
        const line = sim.city.rail[Math.floor(rng.next() * sim.city.rail.length)];
        const len = M.polyLength(line.pts);
        sim.trains.push({ line, d: 0, len, dir: rng.chance(0.5) ? 1 : -1, speed: 22 });
      }
      for (let i = sim.trains.length - 1; i >= 0; i--) {
        const t = sim.trains[i];
        t.d += t.speed * dt;
        if (t.d > t.len + 120) { sim.trains.splice(i, 1); continue; }
        const p = M.polyAt(t.line.pts, t.dir === 1 ? t.d : t.len - t.d);
        t.x = p.x; t.y = p.y; t.angle = p.angle;
        // close crossings near the train
        const near = [];
        sim.net.nodeHash.query(p.x, p.y, 160, near);
        for (const n of near) if (n.railCrossing) n.railClosedUntil = sim.time + 8;
      }
    }

    /* ================= ECONOMY ================= */
    sim.maintenanceCostPerDay = function () {
      let c = 0;
      for (const r of sim.net.roads.values()) {
        const t = TG.ROAD_TYPES[r.type];
        if (t) c += t.maintPerM * r.len * (r.bridge || r.tunnel ? 2.2 : 1);
      }
      c += sim.transit.dailyCost();
      return Math.round(c);
    };
    sim.taxIncomePerDay = function () {
      const happy = sim.stats.happiness;
      return Math.round(sim.population() * 11 * (0.55 + happy * 0.7) * diff.taxMul);
    };
    sim.spend = function (amount, what) {
      if (sim.unlimitedMoney) return true;
      if (amount > sim.budget) { notify('💰 Insufficient funds', 'You need ' + TG.fmt.money(amount) + ' for ' + what + '.', 'bad'); return false; }
      sim.budget -= amount;
      sim.stats.expenseToday += amount;
      return true;
    };
    sim.refund = function (amount) { sim.budget += amount; };

    function endOfDay() {
      const income = sim.taxIncomePerDay();
      const maint = sim.maintenanceCostPerDay();
      sim.budget += income - maint;
      sim.stats.incomeToday = income;
      sim.stats.expenseToday += maint;
      // population growth follows happiness & transit quality
      const growth = (sim.stats.happiness - 0.45) * 0.012 + Math.min(0.004, sim.transit.lines.length * 0.0006);
      for (const z of sim.zones) if (z.type === 'residential') z.pop = Math.max(20, Math.round(z.pop * (1 + growth + (rng.next() - 0.5) * 0.004)));
      for (const line of sim.transit.lines) line.ridersToday = 0;
      sim.stats.co2Today = 0;
      sim.stats.expenseTodayPrev = sim.stats.expenseToday;
      sim.stats.expenseToday = 0;
      if (sim.onDayEnd) sim.onDayEnd({ income, maint });
      notify('🌅 Day ' + sim.day + ' complete', 'Tax income ' + TG.fmt.money(income) + ' · maintenance ' + TG.fmt.money(maint) + ' · population ' + TG.fmt.int(sim.population()), income > maint ? 'good' : 'warn');
    }

    /* ================= SCORING ================= */
    sim.computeScore = function () {
      const s = sim.stats;
      const doneTrips = Math.max(1, s.tripsCompleted);
      const avgDelayRatio = s.freeTimeSum > 0 ? (s.travelTimeSum / Math.max(1, s.freeTimeSum)) : 1;
      const congScore = M.clamp(1 - s.avgCongestion, 0, 1);
      const delayScore = M.clamp(1.9 - avgDelayRatio * 0.5, 0, 1);
      const co2Score = M.clamp(1 - s.co2Rate / (sim.population() * 0.06 + 10), 0, 1);
      const transitShare = s.tripsTotal > 0 ? (s.transitTrips + s.bikeTrips + s.walkTrips) / s.tripsTotal : 0;
      const failRate = s.tripsTotal > 0 ? s.tripsFailed / s.tripsTotal : 0;
      sim.scoreParts = {
        'Congestion': Math.round(congScore * 250),
        'Travel times': Math.round(delayScore * 250),
        'Happiness': Math.round(s.happiness * 200),
        'Green transport': Math.round(M.clamp(transitShare * 2.2, 0, 1) * 150),
        'Emissions': Math.round(co2Score * 100),
        'Reliability': Math.round(M.clamp(1 - failRate * 4, 0, 1) * 50)
      };
      sim.score = Object.values(sim.scoreParts).reduce((a, b) => a + b, 0);
      return sim.score;
    };

    /* ================= NOTIFY ================= */
    function notify(title, body, level, loc) {
      const n = { title, body, level: level || 'info', loc, t: Date.now() };
      if (sim.onNotify) sim.onNotify(n);
    }
    sim.notify = notify;

    /* ================= MAIN TICK ================= */
    sim._tickId = 0;
    const DT = 0.5;

    sim.step = function () {
      const dt = DT;
      sim._tickId++;
      sim.time += dt;
      if (sim.time >= 86400) { sim.time -= 86400; sim.day++; endOfDay(); }

      // spawn demand
      sim.spawnAcc += sim.tripRate() * dt;
      let guard = 0;
      while (sim.spawnAcc > 1 && guard++ < 30) { sim.spawnAcc -= 1; sim.spawnTrip(); }

      // vehicles
      for (const e of [...sim.activeEdges]) updateEdge(e, dt);

      // decay measurements on quiet edges + pollution/noise decay (cheap: sample subset)
      if (sim._tickId % 8 === 0) {
        for (const e of sim.net.edges.values()) {
          if (!e.vehicles.length) {
            const r = sim.net.roads.get(e.road);
            if (r) e.avgSpeed += (r.speed - e.avgSpeed) * 0.03;
          }
          e.pollution *= 0.9985; e.noise *= 0.995;
        }
      }

      // accidents random
      const wf = WEATHERS[sim.weather].accident;
      const activeV = sim.activeVehicleCount();
      if (rng.chance(activeV * dt * 0.0000045 * wf)) sim.spawnAccident(null);
      if (rng.chance(activeV * dt * 0.000003)) sim.spawnAccident(null, { breakdown: true, duration: 90 + rng.next() * 120 });
      for (let i = sim.accidents.length - 1; i >= 0; i--) {
        const a = sim.accidents[i];
        // emergency arrival clears faster
        if (a.emergencySent && a.vehicle && a.vehicle.active) {
          for (const v of sim.vehicles) {
            if (v.active && v.targetAccident === a && v.edgeObj && v.edgeObj.id === a.edge) {
              a.vehicle.stoppedUntil = Math.min(a.vehicle.stoppedUntil, sim.time + 25);
              a.until = Math.min(a.until, sim.time + 25);
              v.targetAccident = null;
            }
          }
        }
        if (sim.time > a.until) {
          sim.accidents.splice(i, 1);
        }
      }
      // emergency vehicles that arrived → head home (despawn at dest)
      // handled by normal finishTrip

      // roadworks expiry
      if (sim._tickId % 40 === 0) {
        let changed = false;
        for (const r of sim.net.roads.values()) {
          if (r.roadworks > 0 && sim.time > r.roadworks && sim.time - r.roadworks < 1e6) { r.roadworks = 0; changed = true; }
        }
        if (changed) sim.net.version++;
      }

      // weather
      if (sim.time > sim.weatherUntil) sim.cycleWeather();

      // random events (~1 per 1.5 days)
      if (rng.chance(dt / 130000) && sim.events.filter(e => e.active).length < 2) sim.triggerEvent();
      if (sim._tickId % 20 === 0) updateEvents();

      updateTrains(dt);
      if (sim._tickId % 30 === 0) sim.syncTransitVehicles();

      // stats sampling
      if (sim._tickId % 60 === 0) sampleQuickStats();
      if (sim.time - sim._lastStatT > 600 || sim.time < sim._lastStatT) {
        sim._lastStatT = sim.time;
        recordHistory();
      }
    };

    function sampleQuickStats() {
      let cong = 0, cnt = 0, speedSum = 0, vcnt = 0;
      for (const e of sim.activeEdges) {
        const r = sim.net.roads.get(e.road);
        if (!r) continue;
        const c = M.clamp(1 - e.avgSpeed / r.speed, 0, 1);
        cong += c * e.vehicles.length; cnt += e.vehicles.length;
        for (const v of e.vehicles) { speedSum += v.vel; vcnt++; }
      }
      sim.stats.avgCongestion = cnt ? cong / cnt : 0;
      sim.stats.avgSpeedNow = vcnt ? speedSum / vcnt : 0;
      sim.stats.co2Rate = sim.emitAcc / 30;
      sim.stats.co2Today += sim.emitAcc * 0.02;
      sim.emitAcc = 0;
      sim.computeScore();
    }

    function recordHistory() {
      const s = sim.stats;
      s.history.push({
        t: sim.day * 86400 + sim.time,
        cong: s.avgCongestion,
        speed: s.avgSpeedNow,
        veh: sim.activeVehicleCount(),
        done: s.tripsCompleted, fail: s.tripsFailed,
        transit: s.transitTrips, budget: sim.budget,
        pop: sim.population(), happy: s.happiness,
        co2: s.co2Rate, score: sim.score
      });
      if (s.history.length > s.maxHistory) s.history.shift();
    }

    /* ================= SERIALIZE ================= */
    sim.toJSON = function () {
      return {
        time: sim.time, day: sim.day, weather: sim.weather, weatherUntil: sim.weatherUntil,
        budget: sim.budget, demandFactor: sim.demandFactor,
        difficulty: sim.difficulty, sandbox: sim.sandbox,
        stats: {
          tripsCompleted: sim.stats.tripsCompleted, tripsFailed: sim.stats.tripsFailed,
          tripsTotal: sim.stats.tripsTotal, transitTrips: sim.stats.transitTrips,
          bikeTrips: sim.stats.bikeTrips, walkTrips: sim.stats.walkTrips,
          travelTimeSum: sim.stats.travelTimeSum, freeTimeSum: sim.stats.freeTimeSum,
          delaySum: sim.stats.delaySum, happiness: sim.stats.happiness,
          history: sim.stats.history.slice(-120)
        },
        transit: sim.transit.toJSON(),
        zones: sim.zones.map(z => ({ id: z.id, pop: z.pop, jobs: z.jobs }))
      };
    };
    sim.applyJSON = function (data) {
      sim.time = data.time; sim.day = data.day; sim.weather = data.weather;
      sim.weatherUntil = data.weatherUntil; sim.budget = data.budget;
      sim.demandFactor = data.demandFactor || 1;
      Object.assign(sim.stats, data.stats);
      sim.stats.history = data.stats.history || [];
      sim.transit.fromJSON(data.transit);
      for (const zd of data.zones || []) {
        const z = sim.zones.find(zz => zz.id === zd.id);
        if (z) { z.pop = zd.pop; z.jobs = zd.jobs; }
      }
      sim.reindexZones();
    };

    return sim;
  }

  TG.Sim = Sim;
  TG.VEH_TYPES = VEH_TYPES;
  TG.WEATHERS = WEATHERS;
  TG.DIFFICULTY = DIFFICULTY;

})(window.TG);
