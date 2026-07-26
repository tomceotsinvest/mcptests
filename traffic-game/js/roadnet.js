/* ============ GRIDLOCK — road network graph ============ */
'use strict';
(function (TG) {
  const { M, MinHeap, SpatialHash } = TG;

  const ROAD_TYPES = {
    path:     { name: 'Path',        speed: 5,    lanes: 1, width: 3,  costPerM: 8,    maintPerM: 0.02, color: '#4a5568', cap: 300 },
    local:    { name: 'Local road',  speed: 13.9, lanes: 1, width: 7,  costPerM: 28,   maintPerM: 0.06, color: '#5b6779', cap: 800 },
    arterial: { name: 'Arterial',    speed: 16.7, lanes: 2, width: 11, costPerM: 70,   maintPerM: 0.14, color: '#7c8aa0', cap: 1800 },
    motorway: { name: 'Motorway',    speed: 27.8, lanes: 3, width: 15, costPerM: 220,  maintPerM: 0.4,  color: '#a8b6cc', cap: 4200 },
    rail:     { name: 'Railway',     speed: 25,   lanes: 1, width: 5,  costPerM: 150,  maintPerM: 0.2,  color: '#6d5f4b', cap: 0 }
  };
  const UPGRADE_ORDER = ['local', 'arterial', 'motorway'];

  let _nid = 1, _rid = 1, _eid = 1;

  function Network() {
    const net = {
      nodes: new Map(),
      roads: new Map(),
      edges: new Map(),          // directed edges
      nodeHash: new SpatialHash(120),
      roadHash: new SpatialHash(160),
      bounds: { x0: 0, y0: 0, x1: 1000, y1: 1000 },
      version: 0                 // bump on any topology change → invalidates cached routes
    };

    net.addNode = function (x, y, opts) {
      const n = {
        id: _nid++, x, y, out: [], inn: [],
        control: 'none',          // none | lights | stop | roundabout | yield
        signal: null, phaseOf: null,
        elev: (opts && opts.elev) || 0,
        crossing: false
      };
      net.nodes.set(n.id, n);
      net.nodeHash.insert(x, y, n);
      return n;
    };

    net.addRoad = function (a, b, pts, type, opts) {
      opts = opts || {};
      if (!pts) pts = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
      const t = ROAD_TYPES[type] || ROAD_TYPES.local;
      const r = {
        id: _rid++, a: a.id, b: b.id, pts, type,
        len: M.polyLength(pts),
        lanes: opts.lanes || t.lanes,
        speed: opts.speed || t.speed,
        oneway: opts.oneway || 0,          // 0 two-way, 1 a→b, -1 b→a
        busLane: !!opts.busLane, cycleLane: !!opts.cycleLane,
        ped: !!opts.ped, closed: false, roadworks: 0,
        bridge: !!opts.bridge, tunnel: !!opts.tunnel,
        ltn: false, crossing: false, turnLane: false,
        name: opts.name || '', fwd: null, bwd: null
      };
      net.roads.set(r.id, r);
      net.rebuildRoadEdges(r);
      net.indexRoad(r);
      net.version++;
      return r;
    };

    net.indexRoad = function (r) {
      let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
      for (const p of r.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      net.roadHash.insertRect(x0, y0, x1, y1, r);
    };

    net.rebuildRoadEdges = function (r) {
      // remove old edges (keep vehicles' handles invalid — sim reroutes them)
      for (const e of [r.fwd, r.bwd]) {
        if (!e) continue;
        net.edges.delete(e.id);
        const from = net.nodes.get(e.from), to = net.nodes.get(e.to);
        if (from) from.out = from.out.filter(id => id !== e.id);
        if (to) to.inn = to.inn.filter(id => id !== e.id);
      }
      r.fwd = r.bwd = null;
      const mkEdge = (from, to, pts) => {
        const e = {
          id: _eid++, road: r.id, from, to, pts, len: r.len,
          vehicles: [],            // sorted: [0] is closest to edge end
          avgSpeed: r.speed, meas: r.speed, flow: 0, flowAcc: 0,
          pollution: 0, noise: 0, blockedUntil: 0
        };
        net.edges.set(e.id, e);
        net.nodes.get(from).out.push(e.id);
        net.nodes.get(to).inn.push(e.id);
        return e;
      };
      if (r.ped || r.type === 'rail') { net.version++; return; }   // no car edges
      if (r.oneway >= 0) r.fwd = mkEdge(r.a, r.b, r.pts);
      if (r.oneway <= 0) r.bwd = mkEdge(r.b, r.a, r.pts.slice().reverse());
      for (const nid of [r.a, r.b]) net.autoSignalGroups(net.nodes.get(nid));
      net.version++;
    };

    net.removeRoad = function (r) {
      for (const e of [r.fwd, r.bwd]) {
        if (!e) continue;
        net.edges.delete(e.id);
        const from = net.nodes.get(e.from), to = net.nodes.get(e.to);
        if (from) from.out = from.out.filter(id => id !== e.id);
        if (to) to.inn = to.inn.filter(id => id !== e.id);
      }
      net.roads.delete(r.id);
      net.version++;
      // orphan node cleanup is deliberate: keep nodes so undo can restore
    };

    net.degree = (n) => {
      const set = new Set();
      for (const id of n.out) set.add(net.edges.get(id).road);
      for (const id of n.inn) set.add(net.edges.get(id).road);
      return set.size;
    };

    /* ---------- signals ---------- */
    net.autoSignalGroups = function (n) {
      if (!n) return;
      // group incoming edges into phases by approach angle (opposite approaches share a phase)
      n.phaseOf = new Map();
      const inns = n.inn.map(id => net.edges.get(id)).filter(Boolean);
      const groups = [];
      for (const e of inns) {
        const p = e.pts[e.pts.length - 2] || e.pts[0];
        const ang = Math.atan2(n.y - p.y, n.x - p.x);
        let gi = -1;
        for (let i = 0; i < groups.length; i++) {
          let d = Math.abs(((ang - groups[i].ang) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2);
          // d is distance from axis-aligned; measure angular diff mod π
          const diff = Math.abs(((ang - groups[i].ang) % Math.PI + Math.PI) % Math.PI);
          const axDiff = Math.min(diff, Math.PI - diff);
          if (axDiff < Math.PI / 4) { gi = i; break; }
        }
        if (gi === -1) { groups.push({ ang, edges: [] }); gi = groups.length - 1; }
        groups[gi].edges.push(e.id);
      }
      for (let i = 0; i < groups.length; i++) for (const eid of groups[i].edges) n.phaseOf.set(eid, i);
      n.phaseCount = Math.max(1, groups.length);
      if (n.signal) {
        if (!n.signal.split || n.signal.split.length !== n.phaseCount) {
          n.signal.split = new Array(n.phaseCount).fill(Math.max(8, Math.round((n.signal.cycle || 40) / n.phaseCount)));
        }
        n.signal.cycle = n.signal.split.reduce((a, b) => a + b, 0);
      }
    };

    net.setLights = function (n, on) {
      if (on) {
        net.autoSignalGroups(n);
        n.control = 'lights';
        const per = Math.max(10, Math.round(44 / n.phaseCount));
        n.signal = { split: new Array(n.phaseCount).fill(per), cycle: per * n.phaseCount, offset: 0 };
      } else {
        n.control = 'none'; n.signal = null;
      }
      net.version++;
    };

    /** Which phase is green at sim time t. Returns phase index, or -1 during all-red interphase. */
    net.greenPhase = function (n, t) {
      const s = n.signal;
      if (!s) return 0;
      let tt = (t + s.offset) % s.cycle;
      for (let i = 0; i < s.split.length; i++) {
        if (tt < s.split[i]) return tt > s.split[i] - 2 ? -1 : i;  // 2 s amber/all-red
        tt -= s.split[i];
      }
      return 0;
    };

    /* ---------- queries ---------- */
    const _q = [];
    net.nearestNode = function (x, y, maxDist) {
      maxDist = maxDist || 100;
      _q.length = 0;
      net.nodeHash.query(x, y, maxDist, _q);
      let best = null, bd = maxDist * maxDist;
      for (const n of _q) {
        const d = M.dist2(x, y, n.x, n.y);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    };

    net.nearestRoad = function (x, y, maxDist) {
      maxDist = maxDist || 60;
      _q.length = 0;
      net.roadHash.query(x, y, maxDist, _q);
      let best = null, bd = maxDist, bt = 0;
      for (const r of _q) {
        if (!net.roads.has(r.id)) continue;
        let acc = 0;
        for (let i = 1; i < r.pts.length; i++) {
          const seg = M.pointSeg(x, y, r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i].x, r.pts[i].y);
          if (seg.d < bd) {
            bd = seg.d; best = r;
            const segLen = M.dist(r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i].x, r.pts[i].y);
            bt = (acc + seg.t * segLen) / Math.max(1, r.len);
          }
        }
        // accumulate acc correctly
        acc = 0;
        for (let i = 1; i < r.pts.length; i++) acc += M.dist(r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i].x, r.pts[i].y);
      }
      return best ? { road: best, dist: bd, t: bt } : null;
    };

    /** Split a road at param t (0..1); creates a node, returns it. Preserves attributes. */
    net.splitRoad = function (r, t) {
      if (t < 0.08 || t > 0.92) return net.nodes.get(t < 0.5 ? r.a : r.b);
      const d = r.len * t;
      const at = M.polyAt(r.pts, d);
      const n = net.addNode(at.x, at.y);
      // split polyline
      const ptsA = [], ptsB = [];
      let acc = 0, placed = false;
      ptsA.push(r.pts[0]);
      for (let i = 1; i < r.pts.length; i++) {
        const seg = M.dist(r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i].x, r.pts[i].y);
        if (!placed && acc + seg >= d) {
          ptsA.push({ x: at.x, y: at.y });
          ptsB.push({ x: at.x, y: at.y });
          placed = true;
        }
        (placed ? ptsB : ptsA).push(r.pts[i]);
        acc += seg;
      }
      if (!placed) { ptsA.push({ x: at.x, y: at.y }); ptsB.push({ x: at.x, y: at.y }, r.pts[r.pts.length - 1]); }
      const keep = { lanes: r.lanes, speed: r.speed, oneway: r.oneway, busLane: r.busLane, cycleLane: r.cycleLane, ped: r.ped, bridge: r.bridge, tunnel: r.tunnel, name: r.name };
      const na = net.nodes.get(r.a), nb = net.nodes.get(r.b);
      net.removeRoad(r);
      const r1 = net.addRoad(na, n, ptsA, r.type, keep);
      const r2 = net.addRoad(n, nb, ptsB, r.type, keep);
      r1.ltn = r2.ltn = r.ltn;
      return n;
    };

    /* ---------- routing ---------- */
    const JUNCTION_PENALTY = { none: 2, yield: 4, stop: 8, lights: 16, roundabout: 5 };

    /** Live cost of traversing an edge (seconds). */
    net.edgeCost = function (e, opts) {
      const r = net.roads.get(e.road);
      if (!r || r.closed || r.ped) return Infinity;
      if (r.roadworks > 0 && r.lanes <= 1) return Infinity;
      let speed = Math.max(1.2, e.avgSpeed);
      let cost = e.len / speed;
      if (r.ltn && !(opts && opts.ltnOk)) cost *= 9;
      if (r.roadworks > 0) cost *= 2.4;
      const to = net.nodes.get(e.to);
      cost += (JUNCTION_PENALTY[to.control] || 2) * (opts && opts.smart ? 1 : 0.6);
      // mild preference for higher-class roads
      if (r.type === 'local') cost *= 1.12;
      if (r.type === 'motorway') cost *= 0.92;
      return cost;
    };

    /** A* from node to node over directed edges. Returns array of edge ids or null. */
    net.route = function (fromId, toId, opts) {
      opts = opts || {};
      const goal = net.nodes.get(toId);
      const start = net.nodes.get(fromId);
      if (!goal || !start) return null;
      const hSpeed = 25; // heuristic speed m/s (must be >= max real speed for admissibility; slight over is fine for gameplay)
      const dist = new Map(), prev = new Map();
      const heap = new MinHeap();
      dist.set(fromId, 0);
      heap.push(fromId, M.dist(start.x, start.y, goal.x, goal.y) / hSpeed);
      let iter = 0;
      while (heap.size && iter++ < 20000) {
        const nid = heap.pop();
        if (nid === toId) break;
        const n = net.nodes.get(nid);
        if (!n) continue;
        const base = dist.get(nid);
        for (const eid of n.out) {
          const e = net.edges.get(eid);
          const c = net.edgeCost(e, opts);
          if (!isFinite(c)) continue;
          const nd = base + c;
          if (nd < (dist.get(e.to) ?? Infinity)) {
            dist.set(e.to, nd);
            prev.set(e.to, eid);
            const tn = net.nodes.get(e.to);
            heap.push(e.to, nd + M.dist(tn.x, tn.y, goal.x, goal.y) / hSpeed);
          }
        }
      }
      if (!prev.has(toId)) return null;
      const path = [];
      let cur = toId;
      while (cur !== fromId) {
        const eid = prev.get(cur);
        if (!eid) break;
        path.push(eid);
        cur = net.edges.get(eid).from;
      }
      path.reverse();
      return path;
    };

    net.routeTime = function (path) {
      let t = 0;
      for (const eid of path) {
        const e = net.edges.get(eid);
        if (!e) return Infinity;
        t += net.edgeCost(e, { ltnOk: true });
      }
      return t;
    };

    net.reindex = function () {
      net.nodeHash.clear(); net.roadHash.clear();
      for (const n of net.nodes.values()) net.nodeHash.insert(n.x, n.y, n);
      for (const r of net.roads.values()) net.indexRoad(r);
    };

    /* ---------- serialization ---------- */
    net.toJSON = function () {
      return {
        nid: _nid, rid: _rid, eid: _eid,
        bounds: net.bounds,
        nodes: [...net.nodes.values()].map(n => ({
          id: n.id, x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10,
          c: n.control, s: n.signal, e: n.elev, cr: n.crossing ? 1 : 0
        })),
        roads: [...net.roads.values()].map(r => ({
          id: r.id, a: r.a, b: r.b, t: r.type,
          p: r.pts.map(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
          l: r.lanes, s: Math.round(r.speed * 10) / 10, o: r.oneway,
          f: (r.busLane ? 1 : 0) | (r.cycleLane ? 2 : 0) | (r.ped ? 4 : 0) | (r.bridge ? 8 : 0) |
             (r.tunnel ? 16 : 0) | (r.ltn ? 32 : 0) | (r.crossing ? 64 : 0) | (r.turnLane ? 128 : 0) | (r.closed ? 256 : 0),
          n: r.name || undefined
        }))
      };
    };

    return net;
  }

  Network.fromJSON = function (data) {
    const net = Network();
    _nid = data.nid; _rid = data.rid; _eid = data.eid;
    net.bounds = data.bounds;
    for (const nd of data.nodes) {
      const n = { id: nd.id, x: nd.x, y: nd.y, out: [], inn: [], control: nd.c, signal: nd.s, phaseOf: null, elev: nd.e || 0, crossing: !!nd.cr };
      net.nodes.set(n.id, n);
    }
    for (const rd of data.roads) {
      const r = {
        id: rd.id, a: rd.a, b: rd.b, type: rd.t,
        pts: rd.p.map(p => ({ x: p[0], y: p[1] })),
        lanes: rd.l, speed: rd.s, oneway: rd.o,
        busLane: !!(rd.f & 1), cycleLane: !!(rd.f & 2), ped: !!(rd.f & 4),
        bridge: !!(rd.f & 8), tunnel: !!(rd.f & 16), ltn: !!(rd.f & 32),
        crossing: !!(rd.f & 64), turnLane: !!(rd.f & 128), closed: !!(rd.f & 256),
        roadworks: 0, name: rd.n || '', fwd: null, bwd: null
      };
      r.len = M.polyLength(r.pts);
      net.roads.set(r.id, r);
      net.rebuildRoadEdges(r);
    }
    for (const n of net.nodes.values()) net.autoSignalGroups(n);
    net.reindex();
    return net;
  };

  Network.resetIds = function () { _nid = 1; _rid = 1; _eid = 1; };

  TG.Network = Network;
  TG.ROAD_TYPES = ROAD_TYPES;
  TG.UPGRADE_ORDER = UPGRADE_ORDER;

})(window.TG);
