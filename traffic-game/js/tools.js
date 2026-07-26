/* ============ GRIDLOCK — construction tools & undo/redo ============ */
'use strict';
(function (TG) {
  const { M, fmt, ROAD_TYPES, UPGRADE_ORDER } = TG;

  const COSTS = {
    lights: 8000, stop: 600, roundabout: 26000, crossing: 2200, turnlane: 6500,
    buslanePerM: 26, cyclelanePerM: 11, pedestrianisePerM: 34, ltn: 4000,
    bridgeMul: 3.2, tunnelMul: 5.5, refund: 0.3
  };

  function Tools(game) {
    const T = {
      current: 'select',
      chain: null,          // road building chain state
      stops: null,          // transit line stops
      hint: '',
      undoStack: [], redoStack: [], maxUndo: 10
    };
    const sim = () => game.sim;
    const net = () => game.sim.net;

    /* ---------- undo ---------- */
    function snapshot(label) {
      try {
        T.undoStack.push({ label, net: net().toJSON(), budget: sim().budget, transit: sim().transit.toJSON() });
        if (T.undoStack.length > T.maxUndo) T.undoStack.shift();
        T.redoStack.length = 0;
      } catch (e) { /* snapshot best-effort */ }
    }
    T.undo = function () {
      if (!T.undoStack.length) return game.ui.toast('Nothing to undo', '', 'warn');
      const cur = { label: 'redo', net: net().toJSON(), budget: sim().budget, transit: sim().transit.toJSON() };
      const s = T.undoStack.pop();
      T.redoStack.push(cur);
      game.restoreSnapshot(s);
      game.ui.toast('↶ Undid: ' + s.label, '', 'info');
    };
    T.redo = function () {
      if (!T.redoStack.length) return game.ui.toast('Nothing to redo', '', 'warn');
      const cur = { label: 'undo', net: net().toJSON(), budget: sim().budget, transit: sim().transit.toJSON() };
      const s = T.redoStack.pop();
      T.undoStack.push(cur);
      game.restoreSnapshot(s);
      game.ui.toast('↷ Redone', '', 'info');
    };

    /* ---------- helpers ---------- */
    function snapRadius() { return M.clamp(22 / game.renderer.cam.zoom, 10, 60); }

    /** Resolve a click into an anchor node (existing, split from road, or brand new). */
    function resolveAnchor(wx, wy, createNew) {
      const n = net().nearestNode(wx, wy, snapRadius());
      if (n) return { node: n, x: n.x, y: n.y, isNew: false };
      const hit = net().nearestRoad(wx, wy, snapRadius());
      if (hit) {
        return { splitRoad: hit.road, splitT: hit.t, x: hit.road.pts ? M.polyAt(hit.road.pts, hit.road.len * hit.t).x : wx, y: hit.road.pts ? M.polyAt(hit.road.pts, hit.road.len * hit.t).y : wy, isNew: false };
      }
      if (createNew) return { x: wx, y: wy, isNew: true };
      return null;
    }
    function materialize(anchor) {
      if (anchor.node) return anchor.node;
      if (anchor.splitRoad && net().roads.has(anchor.splitRoad.id)) return net().splitRoad(anchor.splitRoad, anchor.splitT);
      return net().addNode(anchor.x, anchor.y);
    }
    function crossesWater(x0, y0, x1, y1) {
      const city = game.city;
      if (!city.water || !city.water.length) return false;
      const steps = Math.max(2, Math.ceil(M.dist(x0, y0, x1, y1) / 25));
      for (let i = 1; i < steps; i++) {
        const x = M.lerp(x0, x1, i / steps), y = M.lerp(y0, y1, i / steps);
        for (const w of city.water) if (M.pointInPoly(x, y, w.poly)) return true;
      }
      return false;
    }
    function roadAt(wx, wy) {
      const hit = net().nearestRoad(wx, wy, snapRadius() * 1.4);
      return hit ? hit.road : null;
    }
    function nodeAt(wx, wy) {
      return net().nearestNode(wx, wy, snapRadius() * 1.3);
    }
    function buildCost(type, len, bridge, tunnel) {
      let c = ROAD_TYPES[type].costPerM * len;
      if (bridge) c *= COSTS.bridgeMul;
      if (tunnel) c *= COSTS.tunnelMul;
      return Math.round(c);
    }

    /* ---------- road construction ---------- */
    function beginOrExtendRoad(wx, wy, kind) {
      const type = kind === 'bridge' || kind === 'tunnel' ? 'arterial' : kind;
      const isBridge = kind === 'bridge', isTunnel = kind === 'tunnel';
      const anchor = resolveAnchor(wx, wy, true);
      if (!T.chain) {
        T.chain = { from: anchor, kind };
        return;
      }
      const from = T.chain.from;
      const x0 = from.x, y0 = from.y, x1 = anchor.x, y1 = anchor.y;
      const len = M.dist(x0, y0, x1, y1);
      if (len < 16) { game.ui.toast('Too short', 'Drag further before clicking.', 'warn'); return; }
      if (len > 1200) { game.ui.toast('Too long', 'Build in shorter segments.', 'warn'); return; }
      const waterHit = crossesWater(x0, y0, x1, y1);
      if (waterHit && !isBridge && !isTunnel) {
        game.ui.toast('⚠ Water in the way', 'Use the Bridge or Tunnel tool to cross water.', 'warn');
        return;
      }
      const cost = buildCost(type, len, isBridge || waterHit, isTunnel);
      snapshot('Build ' + kind + ' (' + fmt.money(cost) + ')');
      if (!sim().spend(cost, 'road construction')) { T.undoStack.pop(); return; }

      const a = materialize(from);
      const b = materialize(anchor);
      if (a === b) { return; }

      if (isBridge || isTunnel) {
        // grade separated: single road, no junctions with crossed roads
        const r = net().addRoad(a, b, null, type, { bridge: isBridge, tunnel: isTunnel });
        r.name = isBridge ? 'New bridge' : 'New tunnel';
      } else {
        // find crossings with existing roads → create junctions
        const crossings = [];
        const cand = [];
        net().roadHash.query((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + 50, cand);
        for (const r of cand) {
          if (!net().roads.has(r.id) || r.bridge || r.tunnel) continue;
          for (let i = 1; i < r.pts.length; i++) {
            const hit = M.segIntersect(x0, y0, x1, y1, r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i].x, r.pts[i].y);
            if (hit) crossings.push({ r, t: hit.t, x: hit.x, y: hit.y });
          }
        }
        crossings.sort((p, q) => p.t - q.t);
        let prev = a;
        for (const c of crossings.slice(0, 6)) {
          if (!net().roads.has(c.r.id)) continue;
          const hit = net().nearestRoad(c.x, c.y, 10);
          if (!hit) continue;
          const jn = net().splitRoad(hit.road, hit.t);
          if (jn !== prev) { net().addRoad(prev, jn, null, type); prev = jn; }
        }
        if (prev !== b) net().addRoad(prev, b, null, type);
      }
      game.onNetworkChanged();
      T.chain = { from: { node: b, x: b.x, y: b.y }, kind };  // continue chaining
    }

    /* ---------- transit line construction ---------- */
    function addTransitStop(wx, wy, lineType) {
      const n = nodeAt(wx, wy);
      if (!n) { game.ui.toast('No junction here', 'Click on a junction to place a stop.', 'warn'); return; }
      if (!T.stops) T.stops = { type: lineType, ids: [] };
      if (T.stops.ids[T.stops.ids.length - 1] === n.id) return;
      T.stops.ids.push(n.id);
      const cost = sim().transit.buildCost(lineType, T.stops.ids);
      T.hint = TG.LINE_TYPES[lineType].name + ' line: ' + T.stops.ids.length + ' stops · ' + fmt.money(cost) + '\nDouble-click or Enter to finish · Esc to cancel';
    }
    T.finishTransitLine = function () {
      if (!T.stops || T.stops.ids.length < 2) { T.stops = null; T.hint = ''; return; }
      const cost = sim().transit.buildCost(T.stops.type, T.stops.ids);
      snapshot('Build ' + T.stops.type + ' line');
      if (!sim().spend(cost, 'transit line')) { T.undoStack.pop(); T.stops = null; T.hint = ''; return; }
      const line = sim().transit.addLine(T.stops.type, T.stops.ids);
      sim().syncTransitVehicles();
      game.ui.toast('✅ ' + TG.LINE_TYPES[line.type].name + ' line ' + line.id
        + ' opened', T.stops.ids.length + ' stops. Citizens will start using it when it beats driving.', 'good');
      T.stops = null; T.hint = '';
      game.checkAchievement('firstTransit');
    };

    /* ---------- per-tool click handlers ---------- */
    const clickHandlers = {
      'select': (wx, wy) => game.ui.inspectAt(wx, wy),
      'follow': (wx, wy) => {
        const v = game.findVehicleAt(wx, wy, snapRadius());
        if (v) { game.renderer.followVehicle = v; game.renderer.selected = { kind: 'vehicle', vehicle: v }; game.ui.showVehiclePanel(v); }
        else game.ui.toast('No vehicle there', 'Click closer to a moving car.', 'warn');
      },
      'road-local': (wx, wy) => beginOrExtendRoad(wx, wy, 'local'),
      'road-arterial': (wx, wy) => beginOrExtendRoad(wx, wy, 'arterial'),
      'road-motorway': (wx, wy) => beginOrExtendRoad(wx, wy, 'motorway'),
      'bridge': (wx, wy) => beginOrExtendRoad(wx, wy, 'bridge'),
      'tunnel': (wx, wy) => beginOrExtendRoad(wx, wy, 'tunnel'),
      'delete': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot('Demolish road');
        const refund = Math.round(buildCost(r.type, r.len, r.bridge, r.tunnel) * COSTS.refund);
        net().removeRoad(r);
        sim().refund(refund);
        game.onNetworkChanged();
        game.ui.toast('🗑 Demolished', 'Refunded ' + fmt.money(refund), 'info');
      },
      'upgrade': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        const idx = UPGRADE_ORDER.indexOf(r.type);
        if (idx === -1) return;
        if (r.lanes < ROAD_TYPES[r.type].lanes + 1) {
          const cost = Math.round(ROAD_TYPES[r.type].costPerM * r.len * 0.45);
          snapshot('Add lane (' + fmt.money(cost) + ')');
          if (!sim().spend(cost, 'extra lane')) { T.undoStack.pop(); return; }
          r.lanes++;
          net().version++;
          game.ui.toast('🛣 Lane added', (r.name || 'Road') + ' now has ' + r.lanes + ' lanes each way.', 'good');
        } else if (idx < UPGRADE_ORDER.length - 1) {
          const nt = UPGRADE_ORDER[idx + 1];
          const cost = Math.round((ROAD_TYPES[nt].costPerM - ROAD_TYPES[r.type].costPerM) * r.len * 1.1);
          snapshot('Upgrade to ' + nt);
          if (!sim().spend(cost, 'road upgrade')) { T.undoStack.pop(); return; }
          r.type = nt; r.lanes = ROAD_TYPES[nt].lanes; r.speed = ROAD_TYPES[nt].speed;
          net().rebuildRoadEdges(r);
          game.onNetworkChanged();
          game.ui.toast('⬆ Upgraded', 'Now a ' + ROAD_TYPES[nt].name.toLowerCase() + '.', 'good');
        } else game.ui.toast('Already maxed', 'This is a full motorway with extra lanes.', 'warn');
      },
      'downgrade': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        const idx = UPGRADE_ORDER.indexOf(r.type);
        snapshot('Downgrade road');
        if (r.lanes > ROAD_TYPES[r.type].lanes) { r.lanes--; net().version++; game.ui.toast('Lane removed', '', 'info'); return; }
        if (idx > 0) {
          const nt = UPGRADE_ORDER[idx - 1];
          r.type = nt; r.lanes = ROAD_TYPES[nt].lanes; r.speed = ROAD_TYPES[nt].speed;
          net().rebuildRoadEdges(r);
          game.onNetworkChanged();
          game.ui.toast('⬇ Downgraded', 'Now a ' + ROAD_TYPES[nt].name.toLowerCase() + '.', 'info');
        } else { T.undoStack.pop(); game.ui.toast('Cannot downgrade', 'Already a local road.', 'warn'); }
      },
      'lights': (wx, wy) => {
        const n = nodeAt(wx, wy);
        if (!n) return;
        if (n.control === 'lights') { snapshot('Remove signals'); net().setLights(n, false); game.ui.toast('🚦 Signals removed', '', 'info'); }
        else {
          if (n.inn.length < 3) return game.ui.toast('Not a junction', 'Signals need at least a 3-way junction.', 'warn');
          snapshot('Traffic signals (' + fmt.money(COSTS.lights) + ')');
          if (!sim().spend(COSTS.lights, 'traffic signals')) { T.undoStack.pop(); return; }
          net().setLights(n, true);
          game.ui.toast('🚦 Signals installed', 'Tune them with the Timings tool.', 'good');
        }
        game.onNetworkChanged();
      },
      'timing': (wx, wy) => {
        const n = nodeAt(wx, wy);
        if (!n || n.control !== 'lights') return game.ui.toast('No signals here', 'Click a signalised junction.', 'warn');
        game.ui.showTimingModal(n);
      },
      'stop': (wx, wy) => {
        const n = nodeAt(wx, wy);
        if (!n) return;
        snapshot('Stop sign');
        if (n.control === 'stop') { n.control = 'none'; game.ui.toast('Stop sign removed', '', 'info'); }
        else {
          if (!sim().spend(COSTS.stop, 'stop signs')) { T.undoStack.pop(); return; }
          if (n.control === 'lights') net().setLights(n, false);
          n.control = 'stop';
          game.ui.toast('🛑 Stop signs placed', '', 'good');
        }
        net().version++;
      },
      'roundabout': (wx, wy) => {
        const n = nodeAt(wx, wy);
        if (!n) return;
        if (n.control === 'roundabout') { snapshot('Remove roundabout'); n.control = 'none'; net().version++; return game.ui.toast('Roundabout removed', '', 'info'); }
        if (n.inn.length < 3) return game.ui.toast('Not a junction', 'Roundabouts need at least 3 approaches.', 'warn');
        snapshot('Roundabout (' + fmt.money(COSTS.roundabout) + ')');
        if (!sim().spend(COSTS.roundabout, 'a roundabout')) { T.undoStack.pop(); return; }
        if (n.control === 'lights') net().setLights(n, false);
        n.control = 'roundabout';
        net().version++;
        game.ui.toast('⭕ Roundabout built', 'Smooth flow at medium volumes — watch it at rush hour.', 'good');
        game.checkAchievement('roundabout');
      },
      'oneway': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot('One-way change');
        r.oneway = r.oneway === 0 ? 1 : (r.oneway === 1 ? -1 : 0);
        net().rebuildRoadEdges(r);
        game.onNetworkChanged();
        game.ui.toast('↔ ' + (r.oneway === 0 ? 'Two-way restored' : r.oneway === 1 ? 'One-way (→)' : 'One-way reversed (←)'), '', 'info');
      },
      'speed-up': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot('Speed limit up');
        r.speed = Math.min(36.1, r.speed + 2.78);
        net().version++;
        game.ui.toast('Speed limit: ' + fmt.kmh(r.speed), '', 'info');
      },
      'speed-down': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot('Speed limit down');
        r.speed = Math.max(5.6, r.speed - 2.78);
        net().version++;
        game.ui.toast('Speed limit: ' + fmt.kmh(r.speed), '', 'info');
      },
      'close': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot(r.closed ? 'Reopen road' : 'Close road');
        r.closed = !r.closed;
        net().version++;
        game.onNetworkChanged();
        game.ui.toast(r.closed ? '⛔ Road closed' : '✅ Road reopened', 'Traffic will reroute.', 'info');
      },
      'ltn': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot('Low-traffic neighbourhood');
        if (!r.ltn && !sim().spend(COSTS.ltn, 'an LTN scheme')) { T.undoStack.pop(); return; }
        const turnOn = !r.ltn;
        // flood-fill connected local roads within 220 m
        const cx = r.pts[0].x, cy = r.pts[0].y;
        const cand = [];
        net().roadHash.query(cx, cy, 240, cand);
        let count = 0;
        for (const rr of cand) {
          if (net().roads.has(rr.id) && rr.type === 'local') { rr.ltn = turnOn; count++; }
        }
        net().version++;
        game.ui.toast(turnOn ? '🌳 LTN created' : 'LTN removed', count + ' local streets ' + (turnOn ? 'now discourage through-traffic.' : 'restored.'), turnOn ? 'good' : 'info');
      },
      'crossing': (wx, wy) => {
        const n = nodeAt(wx, wy);
        if (!n) return;
        snapshot('Pedestrian crossing');
        if (!n.crossing && !sim().spend(COSTS.crossing, 'a crossing')) { T.undoStack.pop(); return; }
        n.crossing = !n.crossing;
        for (const eid of n.inn) {
          const e = net().edges.get(eid), rr = e && net().roads.get(e.road);
          if (rr) rr.crossing = n.crossing;
        }
        net().version++;
        game.ui.toast(n.crossing ? '🚶 Crossing added' : 'Crossing removed', '', 'info');
      },
      'buslane': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        if (r.lanes < 2 && !r.busLane) return game.ui.toast('Road too narrow', 'Bus lanes need at least 2 lanes — upgrade first.', 'warn');
        snapshot('Bus lane');
        if (!r.busLane && !sim().spend(Math.round(COSTS.buslanePerM * r.len), 'a bus lane')) { T.undoStack.pop(); return; }
        r.busLane = !r.busLane;
        net().version++;
        game.ui.toast(r.busLane ? '🚌 Bus lane painted' : 'Bus lane removed', r.busLane ? 'Buses now bypass car queues here.' : '', r.busLane ? 'good' : 'info');
      },
      'cyclelane': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot('Cycle lane');
        if (!r.cycleLane && !sim().spend(Math.round(COSTS.cyclelanePerM * r.len), 'a cycle lane')) { T.undoStack.pop(); return; }
        r.cycleLane = !r.cycleLane;
        sim().recountLanes();
        net().version++;
        game.ui.toast(r.cycleLane ? '🚲 Cycle lane added' : 'Cycle lane removed', r.cycleLane ? 'Short trips will shift to bikes.' : '', r.cycleLane ? 'good' : 'info');
      },
      'pedestrianise': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot(r.ped ? 'De-pedestrianise' : 'Pedestrianise');
        if (!r.ped && !sim().spend(Math.round(COSTS.pedestrianisePerM * r.len), 'pedestrianisation')) { T.undoStack.pop(); return; }
        r.ped = !r.ped;
        net().rebuildRoadEdges(r);
        game.onNetworkChanged();
        sim().stats.happiness = M.clamp(sim().stats.happiness + (r.ped ? 0.01 : -0.005), 0, 1);
        game.ui.toast(r.ped ? '🚶 Street pedestrianised' : 'Street reopened to cars', r.ped ? 'Citizens love it. Cars will reroute.' : '', 'good');
      },
      'turnlane': (wx, wy) => {
        const r = roadAt(wx, wy);
        if (!r) return;
        snapshot('Turning lane');
        if (!r.turnLane && !sim().spend(COSTS.turnlane, 'a turning lane')) { T.undoStack.pop(); return; }
        r.turnLane = !r.turnLane;
        if (r.turnLane) r.lanes = Math.max(r.lanes, ROAD_TYPES[r.type].lanes + 1);
        else r.lanes = ROAD_TYPES[r.type].lanes;
        net().version++;
        game.ui.toast(r.turnLane ? '↰ Turn lane added' : 'Turn lane removed', r.turnLane ? 'Extra capacity at the junction.' : '', 'info');
      },
      'busroute': (wx, wy) => addTransitStop(wx, wy, 'bus'),
      'tram': (wx, wy) => addTransitStop(wx, wy, 'tram'),
      'metro': (wx, wy) => addTransitStop(wx, wy, 'metro'),
      'rail': (wx, wy) => addTransitStop(wx, wy, 'rail'),
      'bikeshare': (wx, wy) => placeFacility('bikeshare', wx, wy),
      'parkride': (wx, wy) => placeFacility('parkride', wx, wy),
      'carpark': (wx, wy) => placeFacility('carpark', wx, wy),
      'taxirank': (wx, wy) => placeFacility('taxirank', wx, wy)
    };

    function placeFacility(type, wx, wy) {
      const t = TG.FACILITY_TYPES[type];
      snapshot(t.name + ' (' + fmt.money(t.cost) + ')');
      if (!sim().spend(t.cost, t.name)) { T.undoStack.pop(); return; }
      sim().transit.addFacility(type, wx, wy);
      game.ui.toast(t.icon + ' ' + t.name + ' built', 'Effective within ' + t.radius + ' m.', 'good');
    }

    const sandboxHandlers = {
      'accident': (wx, wy) => {
        const hit = net().nearestRoad(wx, wy, 80);
        const e = hit && (hit.road.fwd || hit.road.bwd);
        if (e) sim().spawnAccident(e);
      },
      'roadworks': (wx, wy) => {
        const hit = net().nearestRoad(wx, wy, 80);
        if (hit) sim().spawnRoadworks(hit.road, 4);
      },
      'event': () => sim().triggerEvent(),
      'weather': () => { sim().cycleWeather(true); game.ui.toast(TG.WEATHERS[sim().weather].icon + ' Weather: ' + TG.WEATHERS[sim().weather].name, '', 'info'); },
      'demand-up': () => { sim().demandFactor = Math.min(3, sim().demandFactor * 1.2); game.ui.toast('Demand ×' + sim().demandFactor.toFixed(2), '', 'info'); },
      'demand-down': () => { sim().demandFactor = Math.max(0.2, sim().demandFactor / 1.2); game.ui.toast('Demand ×' + sim().demandFactor.toFixed(2), '', 'info'); },
      'pop-up': () => {
        for (const z of sim().zones) if (z.type === 'residential') z.pop = Math.round(z.pop * 1.1);
        game.ui.toast('👥 Population +10%', 'Now ' + fmt.int(sim().population()), 'info');
      }
    };

    /* ---------- public API ---------- */
    T.setTool = function (name) {
      T.current = name;
      T.chain = null; T.stops = null; T.hint = '';
      game.renderer.toolPreview = null;
      if (name !== 'select' && name !== 'follow') game.renderer.followVehicle = null;
      const tips = {
        'select': 'Click any road, junction or vehicle to inspect it.',
        'road-local': 'Click to start, click again to build. Chain segments; right-click / Esc to stop.',
        'road-arterial': 'Arterials carry heavy flows between districts.',
        'road-motorway': 'Motorways are fast but expensive. Connect them with slip roads.',
        'bridge': 'Bridges cross water and fly over roads without junctions.',
        'tunnel': 'Tunnels dive under anything — at a price.',
        'lights': 'Click a junction to toggle signals. Signals help crossing flows share fairly.',
        'timing': 'Click a signalised junction to tune green splits and offsets.',
        'roundabout': 'Great for balanced medium flows; struggles when one arm dominates.',
        'oneway': 'Click cycles: two-way → one-way → reversed → two-way.',
        'busroute': 'Click junctions to add stops, double-click to finish the loop.',
        'metro': 'Metro is underground — stops can be anywhere, it ignores roads.',
        'ltn': 'Click a local street to (un)filter its whole neighbourhood from through-traffic.'
      };
      if (tips[name]) game.ui.setTip(tips[name]);
    };

    T.click = function (wx, wy, ev) {
      if (T.current.startsWith('sbx:')) {
        const h = sandboxHandlers[T.current.slice(4)];
        if (h) h(wx, wy);
        return;
      }
      const h = clickHandlers[T.current];
      if (h) h(wx, wy, ev);
    };

    T.dblclick = function () {
      if (T.stops) T.finishTransitLine();
    };

    T.cancel = function () {
      if (T.chain) { T.chain = null; game.renderer.toolPreview = null; return true; }
      if (T.stops) { T.stops = null; T.hint = ''; game.renderer.toolPreview = null; return true; }
      if (T.current !== 'select') { T.setTool('select'); game.ui.syncToolButtons(); return true; }
      return false;
    };

    T.enter = function () {
      if (T.stops) T.finishTransitLine();
    };

    T.move = function (wx, wy) {
      // live preview
      if (T.chain) {
        const from = T.chain.from;
        const len = M.dist(from.x, from.y, wx, wy);
        const kind = T.chain.kind;
        const type = kind === 'bridge' || kind === 'tunnel' ? 'arterial' : kind;
        const water = crossesWater(from.x, from.y, wx, wy);
        const bad = water && kind !== 'bridge' && kind !== 'tunnel';
        const cost = buildCost(type, len, kind === 'bridge' || water, kind === 'tunnel');
        game.renderer.toolPreview = { pts: [{ x: from.x, y: from.y }, { x: wx, y: wy }], ok: !bad && len >= 16, width: ROAD_TYPES[type].width };
        T.hint = Math.round(len) + ' m · ' + fmt.money(cost) + (bad ? '\n⚠ needs bridge/tunnel' : '') + '\nEsc to cancel';
      } else if (T.stops) {
        const nodes = T.stops.ids.map(id => net().nodes.get(id)).filter(Boolean);
        const pts = nodes.map(n => ({ x: n.x, y: n.y }));
        pts.push({ x: wx, y: wy });
        game.renderer.toolPreview = { pts, ok: true, width: 3, nodes };
      } else if (T.current !== 'select' && T.current !== 'follow') {
        const n = nodeAt(wx, wy);
        const needNode = ['lights', 'timing', 'stop', 'roundabout', 'crossing'].includes(T.current);
        if (needNode && n) game.renderer.toolPreview = { nodes: [n] };
        else game.renderer.toolPreview = null;
        if (!T.chain) T.hint = '';
      } else {
        game.renderer.toolPreview = null;
      }
    };

    T.COSTS = COSTS;
    return T;
  }

  TG.Tools = Tools;

})(window.TG);
