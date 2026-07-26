/* ============ GRIDLOCK — public transport ============ */
'use strict';
(function (TG) {
  const { M } = TG;

  const LINE_TYPES = {
    bus:   { name: 'Bus',      speed: 9,  headway: 300, capacity: 60,  buildCost: 0,    costPerStop: 4000,  dailyCost: 900,  color: null, onRoad: true },
    tram:  { name: 'Tram',     speed: 11, headway: 240, capacity: 180, buildCostPerM: 90, costPerStop: 12000, dailyCost: 2200, onRoad: true },
    metro: { name: 'Metro',    speed: 18, headway: 180, capacity: 600, buildCostPerM: 420, costPerStop: 90000, dailyCost: 9000, onRoad: false },
    rail:  { name: 'Rail',     speed: 22, headway: 600, capacity: 800, buildCostPerM: 260, costPerStop: 60000, dailyCost: 6000, onRoad: false }
  };
  const LINE_COLORS = ['#e5484d', '#30a46c', '#0091ff', '#f5a623', '#a855f7', '#12a594', '#e93d82', '#8f9d0a', '#f76b15', '#3e63dd'];
  const FACILITY_TYPES = {
    bikeshare: { name: 'Bike hire', cost: 12000, daily: 60, icon: '🚲', radius: 320 },
    parkride:  { name: 'Park & ride', cost: 90000, daily: 400, icon: '🅿️', radius: 500 },
    carpark:   { name: 'Car park', cost: 140000, daily: 500, icon: '🏢', radius: 380 },
    taxirank:  { name: 'Taxi rank', cost: 15000, daily: 100, icon: '🚕', radius: 300 }
  };

  let _lid = 1, _fid = 1;

  function TransitSystem(net) {
    const ts = {
      net, lines: [], facilities: [],
      version: 0
    };

    ts.addLine = function (type, stopNodeIds) {
      const t = LINE_TYPES[type];
      const line = {
        id: _lid++, type, stops: stopNodeIds.slice(),
        color: LINE_COLORS[(_lid + ts.lines.length) % LINE_COLORS.length],
        headway: t.headway, speed: t.speed, capacity: t.capacity,
        path: [], segLens: [], totalLen: 0,
        ridersToday: 0, ridersTotal: 0, vehicles: []
      };
      ts.recomputeLinePath(line);
      ts.lines.push(line);
      ts.version++;
      return line;
    };

    /** Path along roads for bus/tram; straight segments for metro/rail. Loops back to start. */
    ts.recomputeLinePath = function (line) {
      const t = LINE_TYPES[line.type];
      line.path = [];
      line.totalLen = 0;
      const loop = line.stops.concat([line.stops[0]]);
      if (t.onRoad) {
        for (let i = 1; i < loop.length; i++) {
          const seg = net.route(loop[i - 1], loop[i], { ltnOk: true, transit: true });
          if (seg) line.path.push(...seg);
        }
        for (const eid of line.path) {
          const e = net.edges.get(eid);
          if (e) line.totalLen += e.len;
        }
      } else {
        for (let i = 1; i < loop.length; i++) {
          const a = net.nodes.get(loop[i - 1]), b = net.nodes.get(loop[i]);
          if (a && b) line.totalLen += M.dist(a.x, a.y, b.x, b.y);
        }
      }
      line.netVersion = net.version;
    };

    ts.removeLine = function (line) {
      const i = ts.lines.indexOf(line);
      if (i >= 0) ts.lines.splice(i, 1);
      ts.version++;
    };

    ts.addFacility = function (type, x, y) {
      const n = net.nearestNode(x, y, 250);
      const f = { id: _fid++, type, x, y, nodeId: n ? n.id : null };
      ts.facilities.push(f);
      ts.version++;
      return f;
    };
    ts.removeFacility = function (f) {
      const i = ts.facilities.indexOf(f);
      if (i >= 0) ts.facilities.splice(i, 1);
      ts.version++;
    };

    ts.facilityNear = function (x, y, type) {
      for (const f of ts.facilities) {
        if (type && f.type !== type) continue;
        if (M.dist(x, y, f.x, f.y) < FACILITY_TYPES[f.type].radius) return f;
      }
      return null;
    };

    /**
     * Estimate a transit journey between two nodes.
     * Direct line or one transfer via a shared stop. Returns {time, lines} or null.
     */
    ts.estimate = function (fromNode, toNode) {
      const a = net.nodes.get(fromNode), b = net.nodes.get(toNode);
      if (!a || !b || !ts.lines.length) return null;
      const WALK = 1.3;
      const nearStops = (n) => {
        const out = [];
        for (const line of ts.lines) {
          for (const sid of line.stops) {
            const s = net.nodes.get(sid);
            if (!s) continue;
            const d = M.dist(n.x, n.y, s.x, s.y);
            if (d < 420) out.push({ line, sid, walk: d / WALK });
          }
        }
        return out;
      };
      const so = nearStops(a), sd = nearStops(b);
      if (!so.length || !sd.length) return null;
      let best = null;
      const rideTime = (line, s1, s2) => {
        const n1 = net.nodes.get(s1), n2 = net.nodes.get(s2);
        if (!n1 || !n2) return Infinity;
        return M.dist(n1.x, n1.y, n2.x, n2.y) * 1.35 / line.speed;
      };
      for (const o of so) for (const d of sd) {
        if (o.line === d.line && o.sid !== d.sid) {
          const t = o.walk + d.walk + o.line.headway / 2 + rideTime(o.line, o.sid, d.sid) + 30;
          if (!best || t < best.time) best = { time: t, lines: [o.line], boardStop: o.sid, alightStop: d.sid };
        }
      }
      // one transfer: lines sharing a stop
      if (!best || best.time > 900) {
        for (const o of so) for (const d of sd) {
          if (o.line === d.line) continue;
          for (const s1 of o.line.stops) {
            if (d.line.stops.includes(s1)) {
              const t = o.walk + d.walk + o.line.headway / 2 + d.line.headway / 2 +
                rideTime(o.line, o.sid, s1) + rideTime(d.line, s1, d.sid) + 90;
              if (!best || t < best.time) best = { time: t, lines: [o.line, d.line], boardStop: o.sid, alightStop: d.sid };
              break;
            }
          }
        }
      }
      return best;
    };

    ts.dailyCost = function () {
      let c = 0;
      for (const line of ts.lines) c += LINE_TYPES[line.type].dailyCost * Math.max(1, Math.round(line.stops.length / 3));
      for (const f of ts.facilities) c += FACILITY_TYPES[f.type].daily;
      return c;
    };

    ts.buildCost = function (type, stopNodeIds) {
      const t = LINE_TYPES[type];
      let len = 0;
      for (let i = 1; i < stopNodeIds.length; i++) {
        const a = net.nodes.get(stopNodeIds[i - 1]), b = net.nodes.get(stopNodeIds[i]);
        if (a && b) len += M.dist(a.x, a.y, b.x, b.y);
      }
      return Math.round((t.buildCostPerM || 0) * len + t.costPerStop * stopNodeIds.length);
    };

    ts.toJSON = function () {
      return {
        lid: _lid, fid: _fid,
        lines: ts.lines.map(l => ({ id: l.id, t: l.type, s: l.stops, c: l.color, h: l.headway, rt: l.ridersTotal })),
        facilities: ts.facilities.map(f => ({ id: f.id, t: f.type, x: f.x, y: f.y, n: f.nodeId }))
      };
    };
    ts.fromJSON = function (data) {
      if (!data) return;
      _lid = data.lid || 1; _fid = data.fid || 1;
      ts.lines = [];
      for (const ld of data.lines || []) {
        const t = LINE_TYPES[ld.t];
        const line = {
          id: ld.id, type: ld.t, stops: ld.s, color: ld.c,
          headway: ld.h || t.headway, speed: t.speed, capacity: t.capacity,
          path: [], segLens: [], totalLen: 0, ridersToday: 0, ridersTotal: ld.rt || 0, vehicles: []
        };
        ts.recomputeLinePath(line);
        ts.lines.push(line);
      }
      ts.facilities = (data.facilities || []).map(f => ({ id: f.id, type: f.t, x: f.x, y: f.y, nodeId: f.n }));
    };

    return ts;
  }

  TransitSystem.resetIds = function () { _lid = 1; _fid = 1; };
  TG.TransitSystem = TransitSystem;
  TG.LINE_TYPES = LINE_TYPES;
  TG.FACILITY_TYPES = FACILITY_TYPES;

})(window.TG);
