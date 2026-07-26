/* ============ GRIDLOCK — utilities ============ */
'use strict';
window.TG = window.TG || {};

(function (TG) {

  /** Deterministic PRNG (mulberry32). */
  function RNG(seed) {
    let s = seed >>> 0;
    const next = () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      range: (a, b) => a + next() * (b - a),
      int: (a, b) => Math.floor(a + next() * (b - a + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      gaussian: () => {
        // Box–Muller
        let u = 0, v = 0;
        while (u === 0) u = next();
        while (v === 0) v = next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      /** Weighted pick from [{w, ...}] or parallel weights array. */
      weighted: (items, weights) => {
        const ws = weights || items.map(i => i.w);
        let total = 0;
        for (const w of ws) total += w;
        let r = next() * total;
        for (let i = 0; i < items.length; i++) {
          r -= ws[i];
          if (r <= 0) return items[i];
        }
        return items[items.length - 1];
      }
    };
  }

  const M = {
    clamp: (v, a, b) => v < a ? a : (v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    dist2: (x1, y1, x2, y2) => (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1),
    /** Distance from point p to segment ab; returns {d, t, x, y}. */
    pointSeg(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
      t = M.clamp(t, 0, 1);
      const x = ax + t * dx, y = ay + t * dy;
      return { d: Math.hypot(px - x, py - y), t, x, y };
    },
    /** Do segments (a,b) and (c,d) intersect? Returns {x,y,t} or null. t along ab. */
    segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
      const r1x = bx - ax, r1y = by - ay, r2x = dx - cx, r2y = dy - cy;
      const denom = r1x * r2y - r1y * r2x;
      if (Math.abs(denom) < 1e-10) return null;
      const t = ((cx - ax) * r2y - (cy - ay) * r2x) / denom;
      const u = ((cx - ax) * r1y - (cy - ay) * r1x) / denom;
      if (t < 1e-6 || t > 1 - 1e-6 || u < 1e-6 || u > 1 - 1e-6) return null;
      return { x: ax + t * r1x, y: ay + t * r1y, t, u };
    },
    polyLength(pts) {
      let l = 0;
      for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      return l;
    },
    /** Point at distance d along polyline; returns {x, y, angle}. */
    polyAt(pts, d) {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (acc + seg >= d || i === pts.length - 1) {
          const t = seg > 0 ? M.clamp((d - acc) / seg, 0, 1) : 0;
          return {
            x: M.lerp(pts[i - 1].x, pts[i].x, t),
            y: M.lerp(pts[i - 1].y, pts[i].y, t),
            angle: Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x)
          };
        }
        acc += seg;
      }
      const p = pts[pts.length - 1];
      return { x: p.x, y: p.y, angle: 0 };
    },
    pointInPoly(x, y, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }
  };

  /** Spatial hash grid for fast proximity queries. */
  function SpatialHash(cell) {
    const map = new Map();
    const key = (cx, cy) => cx * 73856093 ^ cy * 19349663;
    return {
      cell,
      clear() { map.clear(); },
      insert(x, y, item) {
        const k = key(Math.floor(x / cell), Math.floor(y / cell));
        let b = map.get(k);
        if (!b) { b = []; map.set(k, b); }
        b.push(item);
      },
      /** Insert an item covering bbox. */
      insertRect(x0, y0, x1, y1, item) {
        const cx0 = Math.floor(Math.min(x0, x1) / cell), cx1 = Math.floor(Math.max(x0, x1) / cell);
        const cy0 = Math.floor(Math.min(y0, y1) / cell), cy1 = Math.floor(Math.max(y0, y1) / cell);
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
          const k = key(cx, cy);
          let b = map.get(k);
          if (!b) { b = []; map.set(k, b); }
          if (b.indexOf(item) === -1) b.push(item);
        }
      },
      query(x, y, r, out) {
        out = out || [];
        const cx0 = Math.floor((x - r) / cell), cx1 = Math.floor((x + r) / cell);
        const cy0 = Math.floor((y - r) / cell), cy1 = Math.floor((y + r) / cell);
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
          const b = map.get(key(cx, cy));
          if (b) for (const it of b) if (out.indexOf(it) === -1) out.push(it);
        }
        return out;
      }
    };
  }

  /** Binary min-heap keyed by numeric priority. */
  function MinHeap() {
    const items = [], prio = [];
    return {
      get size() { return items.length; },
      push(item, p) {
        items.push(item); prio.push(p);
        let i = items.length - 1;
        while (i > 0) {
          const par = (i - 1) >> 1;
          if (prio[par] <= prio[i]) break;
          [items[par], items[i]] = [items[i], items[par]];
          [prio[par], prio[i]] = [prio[i], prio[par]];
          i = par;
        }
      },
      pop() {
        const top = items[0];
        const li = items.pop(), lp = prio.pop();
        if (items.length) {
          items[0] = li; prio[0] = lp;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let s = i;
            if (l < items.length && prio[l] < prio[s]) s = l;
            if (r < items.length && prio[r] < prio[s]) s = r;
            if (s === i) break;
            [items[s], items[i]] = [items[i], items[s]];
            [prio[s], prio[i]] = [prio[i], prio[s]];
            i = s;
          }
        }
        return top;
      }
    };
  }

  const fmt = {
    money: (v) => {
      const sign = v < 0 ? '−' : '';
      v = Math.abs(v);
      if (v >= 1e6) return sign + '£' + (v / 1e6).toFixed(2) + 'M';
      if (v >= 1e3) return sign + '£' + (v / 1e3).toFixed(1) + 'k';
      return sign + '£' + Math.round(v);
    },
    int: (v) => Math.round(v).toLocaleString('en-GB'),
    pct: (v) => Math.round(v * 100) + '%',
    kmh: (ms) => Math.round(ms * 3.6) + ' km/h',
    time: (secs) => {
      const h = Math.floor(secs / 3600) % 24, m = Math.floor(secs / 60) % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },
    dur: (secs) => {
      if (secs < 90) return Math.round(secs) + ' s';
      return Math.round(secs / 60) + ' min';
    }
  };

  TG.RNG = RNG;
  TG.M = M;
  TG.SpatialHash = SpatialHash;
  TG.MinHeap = MinHeap;
  TG.fmt = fmt;

})(window.TG);
