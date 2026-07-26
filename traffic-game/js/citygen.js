/* ============ GRIDLOCK — procedural city generation ============ */
'use strict';
(function (TG) {
  const { M, RNG, Network } = TG;

  const ZONE_COLORS = {
    residential: '#2e4a3d', commercial: '#3d3a55', office: '#2f4257',
    industrial: '#4d4433', retail: '#54324a', school: '#3d5232',
    hospital: '#5b3535', stadium: '#33505c', park: '#26492e', station: '#4a4a38'
  };
  const BUILDING_COLORS = {
    residential: ['#7d9e8c', '#8fae9b', '#6f8f7e', '#9db5a4'],
    commercial: ['#9a93c9', '#8a82bb', '#aba3d6'],
    office: ['#7f9ec0', '#8faccc', '#6e8fb3'],
    industrial: ['#b0a184', '#9c8f74', '#c0b294'],
    retail: ['#c48fb4', '#b57fa5', '#d09fc0'],
    school: ['#96c07f', '#a5cc90'],
    hospital: ['#d99090', '#c98080'],
    stadium: ['#86bcd1'], park: ['#3f7a4d'], station: ['#c2bb87']
  };

  const SIZES = {
    village: { w: 900, h: 700, cell: 65 },
    small:   { w: 1300, h: 1000, cell: 62 },
    medium:  { w: 2100, h: 1500, cell: 64 },
    large:   { w: 3000, h: 2200, cell: 68 }
  };

  /**
   * Generate a city. cfg: { style, size, seed, population, riverEnabled, motorway, rail }
   * Returns { net, zones, buildings, water, rail, pois, name }
   */
  function generateCity(cfg) {
    const rng = RNG(cfg.seed || 1);
    const size = SIZES[cfg.size] || SIZES.medium;
    const W = size.w, H = size.h, cell = size.cell;
    const cols = Math.floor(W / cell), rows = Math.floor(H / cell);
    const style = cfg.style || 'grid';

    Network.resetIds();
    const net = Network();
    net.bounds = { x0: -80, y0: -80, x1: W + 80, y1: H + 80 };

    /* ---------- 1. water ---------- */
    const water = [];      // polygons for rendering
    let riverBand = null;  // function (x) → {y0, y1} or null
    if (cfg.riverEnabled !== false && style !== 'mountain') {
      if (style === 'coastal') {
        const coastY = H * rng.range(0.72, 0.82);
        const top = [], amp = H * 0.03;
        for (let x = -100; x <= W + 100; x += 90) top.push({ x, y: coastY + Math.sin(x * 0.004 + rng.range(0, 6)) * amp + rng.range(-8, 8) });
        const poly = top.concat([{ x: W + 100, y: H + 200 }, { x: -100, y: H + 200 }]);
        water.push({ poly, sea: true });
        riverBand = (x) => {
          let y = coastY;
          for (let i = 1; i < top.length; i++) if (top[i].x >= x) { y = M.lerp(top[i - 1].y, top[i].y, (x - top[i - 1].x) / 90); break; }
          return { y0: y, y1: H + 300 };
        };
      } else {
        const midY = H * rng.range(0.38, 0.6), width = M.clamp(W * 0.028, 26, 60);
        const path = [];
        for (let x = -100; x <= W + 100; x += 80) {
          path.push({ x, y: midY + Math.sin(x * 0.0028 + rng.range(0, 2)) * H * 0.09 + Math.sin(x * 0.009) * H * 0.025 });
        }
        const up = path.map(p => ({ x: p.x, y: p.y - width / 2 }));
        const dn = path.slice().reverse().map(p => ({ x: p.x, y: p.y + width / 2 }));
        water.push({ poly: up.concat(dn), river: true });
        riverBand = (x) => {
          let y = midY;
          for (let i = 1; i < path.length; i++) if (path[i].x >= x) { y = M.lerp(path[i - 1].y, path[i].y, (x - path[i - 1].x) / 80); break; }
          return { y0: y - width / 2 - 6, y1: y + width / 2 + 6 };
        };
      }
    }
    // mountain: impassable rock polygons
    const rocks = [];
    if (style === 'mountain') {
      const nRocks = 3 + Math.floor(cols / 8);
      for (let i = 0; i < nRocks; i++) {
        const cx = rng.range(W * 0.05, W * 0.95), cy = rng.range(H * 0.05, H * 0.95);
        const rr = rng.range(90, 220), poly = [];
        for (let a = 0; a < Math.PI * 2; a += 0.5) poly.push({ x: cx + Math.cos(a) * rr * rng.range(0.6, 1.1), y: cy + Math.sin(a) * rr * rng.range(0.6, 1.1) });
        rocks.push({ poly, cx, cy, r: rr });
      }
    }
    const inWater = (x, y) => {
      if (riverBand) { const b = riverBand(x); if (y > b.y0 && y < b.y1) return true; }
      for (const rk of rocks) if (M.dist(x, y, rk.cx, rk.cy) < rk.r * 0.85) return true;
      return false;
    };

    /* ---------- 2. node lattice ---------- */
    const jitter = { grid: 2, suburb: 9, organic: 18, coastal: 10, mountain: 12 }[style] || 6;
    const gridNodes = [];   // [row][col] → node or null
    for (let r = 0; r <= rows; r++) {
      gridNodes.push([]);
      for (let c = 0; c <= cols; c++) {
        const x = c * cell + rng.range(-jitter, jitter);
        const y = r * cell + rng.range(-jitter, jitter);
        if (inWater(x, y)) { gridNodes[r].push(null); continue; }
        gridNodes[r].push(net.addNode(x, y));
      }
    }

    /* ---------- 3. roads ---------- */
    const artEvery = style === 'suburb' ? 5 : 4;
    const keepP = { grid: 0.97, suburb: 0.8, organic: 0.82, coastal: 0.86, mountain: 0.8 }[style] || 0.9;
    const isArtRow = (r) => r % artEvery === Math.floor(artEvery / 2);
    const isArtCol = (c) => c % artEvery === Math.floor(artEvery / 2);
    const roadBetween = (n1, n2, type) => {
      const pts = [{ x: n1.x, y: n1.y }];
      if (style === 'organic' && rng.chance(0.5)) {
        pts.push({ x: (n1.x + n2.x) / 2 + rng.range(-12, 12), y: (n1.y + n2.y) / 2 + rng.range(-12, 12) });
      }
      pts.push({ x: n2.x, y: n2.y });
      return net.addRoad(n1, n2, pts, type);
    };

    const bridgeXs = [];
    if (riverBand) {
      const nBridges = Math.max(2, Math.floor(cols / 9));
      for (let i = 0; i < nBridges; i++) bridgeXs.push(W * (i + 0.6) / nBridges + rng.range(-60, 60));
    }
    const nearBridge = (x) => bridgeXs.some(bx => Math.abs(bx - x) < cell * 0.9);

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const n = gridNodes[r][c];
        if (!n) continue;
        // horizontal edge
        if (c < cols && gridNodes[r][c + 1]) {
          const n2 = gridNodes[r][c + 1];
          const art = isArtRow(r);
          if (art || rng.chance(keepP)) roadBetween(n, n2, art ? 'arterial' : 'local');
        }
        // vertical edge
        if (r < rows && gridNodes[r + 1][c]) {
          const n2 = gridNodes[r + 1][c];
          const art = isArtCol(c);
          const midX = (n.x + n2.x) / 2, midY = (n.y + n2.y) / 2;
          let crossesWater = false;
          if (riverBand) {
            const b1 = riverBand(n.x), b2 = riverBand(n2.x);
            crossesWater = (n.y < b1.y0 && n2.y > b2.y1) || (n.y > b1.y1 && n2.y < b2.y0);
          }
          if (crossesWater) {
            if (nearBridge(midX) && art) {
              const rd = roadBetween(n, n2, 'arterial');
              rd.bridge = true;
            }
            continue;
          }
          if (art || rng.chance(keepP)) roadBetween(n, n2, art ? 'arterial' : 'local');
        }
      }
    }

    /* ---------- 4. motorway bypass ---------- */
    if (cfg.motorway !== false && (cfg.size === 'medium' || cfg.size === 'large')) {
      const my = -cell * 0.9;
      let prev = null;
      const slipEvery = Math.max(3, Math.floor(cols / 5));
      for (let c = 0; c <= cols; c += 2) {
        const x = c * cell;
        const n = net.addNode(x, my);
        if (prev) {
          const rd = net.addRoad(prev, n, null, 'motorway');
          rd.name = 'M1 Bypass';
        }
        if (c % slipEvery === 0) {
          // slip road down to nearest top-row arterial node
          for (let r = 0; r < 3; r++) {
            const t = gridNodes[r] && gridNodes[r][c];
            if (t) { const s = net.addRoad(n, t, null, 'arterial'); s.name = 'Slip road'; break; }
          }
        }
        prev = n;
      }
    }

    /* ---------- 5. rail line ---------- */
    const rail = [];
    if (cfg.rail !== false && cfg.size !== 'village') {
      const ry = H * rng.range(0.15, 0.3);
      const pts = [];
      for (let x = -80; x <= W + 80; x += 120) pts.push({ x, y: ry + Math.sin(x * 0.002) * 30 });
      rail.push({ pts });
      // mark road nodes near the rail as level crossings
      for (const n of net.nodes.values()) {
        for (let i = 1; i < pts.length; i++) {
          const s = M.pointSeg(n.x, n.y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
          if (s.d < cell * 0.45) { n.railCrossing = true; break; }
        }
      }
    }

    /* ---------- 6. connectivity cleanup ---------- */
    pruneDisconnected(net);

    /* ---------- 7. districts & zones ---------- */
    const distTypes = pickDistricts(style, cfg.size, rng);
    const centers = distTypes.map(t => ({ type: t, x: rng.range(W * 0.08, W * 0.92), y: rng.range(H * 0.08, H * 0.92) }));
    // industrial prefers edges; parks anywhere; commercial center
    for (const ct of centers) {
      if (ct.type === 'commercial' || ct.type === 'office') { ct.x = M.lerp(ct.x, W / 2, 0.55); ct.y = M.lerp(ct.y, H / 2, 0.55); }
      if (ct.type === 'industrial') { ct.x = rng.chance(0.5) ? rng.range(0, W * 0.15) : rng.range(W * 0.85, W); }
    }

    const zones = [], buildings = [], pois = [];
    const zoneOfCell = [];
    for (let r = 0; r < rows; r++) {
      zoneOfCell.push([]);
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * cell, cy = (r + 0.5) * cell;
        if (inWater(cx, cy)) { zoneOfCell[r].push(null); continue; }
        let best = null, bd = Infinity;
        for (const ct of centers) {
          const d = M.dist2(cx, cy, ct.x, ct.y) * rng.range(0.7, 1.35);
          if (d < bd) { bd = d; best = ct; }
        }
        zoneOfCell[r].push(best ? best.type : 'residential');
      }
    }

    // one stadium, schools, hospitals as point landmarks on specific cells
    const landmarks = [];
    if (cfg.size !== 'village') landmarks.push('stadium');
    const nSchools = { village: 1, small: 2, medium: 4, large: 6 }[cfg.size] || 2;
    const nHosp = { village: 0, small: 1, medium: 2, large: 3 }[cfg.size] || 1;
    for (let i = 0; i < nSchools; i++) landmarks.push('school');
    for (let i = 0; i < nHosp; i++) landmarks.push('hospital');
    if (rail.length) landmarks.push('station', 'station');
    for (const lm of landmarks) {
      for (let tries = 0; tries < 40; tries++) {
        const r = rng.int(1, rows - 2), c = rng.int(1, cols - 2);
        if (!zoneOfCell[r][c]) continue;
        if (lm === 'station') {
          // near the rail line
          const cy = (r + 0.5) * cell;
          if (!rail.length || Math.abs(cy - rail[0].pts[0].y) > cell * 2.2) continue;
        }
        zoneOfCell[r][c] = lm;
        break;
      }
    }

    // group contiguous same-type cells into zones (simple: one zone per cell for landmarks, per 2x2-ish blob otherwise)
    const zoneAt = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = zoneOfCell[r][c];
        if (!t) continue;
        const cx = (c + 0.5) * cell, cy = (r + 0.5) * cell;
        const z = {
          id: zones.length + 1, type: t, cx, cy,
          x0: c * cell + 7, y0: r * cell + 7, x1: (c + 1) * cell - 7, y1: (r + 1) * cell - 7,
          pop: 0, jobs: 0, anchors: []
        };
        zones.push(z);
        genBuildings(z, rng, buildings);
        if (t === 'school' || t === 'hospital' || t === 'stadium' || t === 'station') {
          pois.push({ type: t, x: cx, y: cy, zone: z.id });
        }
      }
    }

    /* ---------- 8. anchors, population & jobs ---------- */
    assignAnchors(net, zones);
    distributePopulation(zones, cfg.population || 15000, rng);

    /* ---------- 9. initial junction control ---------- */
    for (const n of net.nodes.values()) {
      const deg = n.inn.length;
      if (deg < 3) continue;
      let artCount = 0;
      for (const eid of n.inn) {
        const e = net.edges.get(eid), rd = net.roads.get(e.road);
        if (rd && (rd.type === 'arterial' || rd.type === 'motorway')) artCount++;
      }
      if (artCount >= 3 && rng.chance(0.85)) net.setLights(n, true);
      else if (artCount >= 1 && deg >= 3 && rng.chance(0.4)) n.control = 'stop';
    }

    const name = cityName(rng, style);
    return { net, zones, buildings, water, rocks, rail, pois, name, W, H };
  }

  function genBuildings(z, rng, out) {
    const w = z.x1 - z.x0, h = z.y1 - z.y0;
    const colors = BUILDING_COLORS[z.type] || BUILDING_COLORS.residential;
    if (z.type === 'park') {
      out.push({ x: z.x0, y: z.y0, w, h, color: ZONE_COLORS.park, park: true, zone: z.id });
      return;
    }
    if (z.type === 'stadium') {
      out.push({ x: z.cx - w * 0.38, y: z.cy - h * 0.3, w: w * 0.76, h: h * 0.6, color: colors[0], round: true, zone: z.id, label: '🏟' });
      return;
    }
    if (z.type === 'school' || z.type === 'hospital' || z.type === 'station') {
      out.push({ x: z.cx - w * 0.32, y: z.cy - h * 0.28, w: w * 0.64, h: h * 0.56, color: colors[0], zone: z.id, label: z.type === 'school' ? '🏫' : z.type === 'hospital' ? '🏥' : '🚉' });
      return;
    }
    const n = z.type === 'residential' ? rng.int(3, 5) : rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const bw = rng.range(w * 0.18, w * 0.34), bh = rng.range(h * 0.18, h * 0.34);
      out.push({
        x: rng.range(z.x0, z.x1 - bw), y: rng.range(z.y0, z.y1 - bh),
        w: bw, h: bh, color: rng.pick(colors), zone: z.id,
        tall: (z.type === 'office' || z.type === 'commercial') && rng.chance(0.6)
      });
    }
  }

  function pickDistricts(style, size, rng) {
    const base = ['residential', 'residential', 'residential', 'commercial', 'office', 'industrial', 'retail', 'park'];
    const extra = { village: 0, small: 2, medium: 6, large: 10 }[size] || 4;
    const pool = ['residential', 'residential', 'commercial', 'office', 'industrial', 'retail', 'park', 'residential'];
    const out = base.slice();
    for (let i = 0; i < extra; i++) out.push(rng.pick(pool));
    return out;
  }

  function assignAnchors(net, zones) {
    for (const z of zones) {
      const cand = [];
      net.nodeHash.query(z.cx, z.cy, 160, cand);
      cand.sort((a, b) => M.dist2(z.cx, z.cy, a.x, a.y) - M.dist2(z.cx, z.cy, b.x, b.y));
      z.anchors = cand.filter(n => n.out.length > 0).slice(0, 4).map(n => n.id);
      if (!z.anchors.length) {
        const n = net.nearestNode(z.cx, z.cy, 400);
        if (n) z.anchors = [n.id];
      }
    }
  }

  function distributePopulation(zones, totalPop, rng) {
    const resZones = zones.filter(z => z.type === 'residential');
    const jobZones = zones.filter(z => ['commercial', 'office', 'industrial', 'retail', 'hospital', 'school', 'stadium'].includes(z.type));
    let wsum = 0;
    const ws = resZones.map(() => { const w = 0.5 + rng.next(); wsum += w; return w; });
    resZones.forEach((z, i) => { z.pop = Math.round(totalPop * ws[i] / wsum); });
    let jsum = 0;
    const jw = jobZones.map(z => {
      const w = { commercial: 1.4, office: 1.6, industrial: 1.1, retail: 1.0, hospital: 0.7, school: 0.5, stadium: 0.3 }[z.type] || 1;
      jsum += w; return w;
    });
    const totalJobs = totalPop * 0.55;
    jobZones.forEach((z, i) => { z.jobs = Math.round(totalJobs * jw[i] / jsum); });
  }

  function pruneDisconnected(net) {
    // undirected flood fill from the road-graph's largest component
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const n of net.nodes.keys()) parent.set(n, n);
    for (const r of net.roads.values()) {
      const ra = find(r.a), rb = find(r.b);
      if (ra !== rb) parent.set(ra, rb);
    }
    const compSize = new Map();
    for (const n of net.nodes.keys()) {
      const root = find(n);
      compSize.set(root, (compSize.get(root) || 0) + 1);
    }
    let bigRoot = null, bigSize = 0;
    for (const [root, s] of compSize) if (s > bigSize) { bigSize = s; bigRoot = root; }
    for (const r of [...net.roads.values()]) {
      if (find(r.a) !== bigRoot) net.removeRoad(r);
    }
    for (const n of [...net.nodes.values()]) {
      if (n.out.length === 0 && n.inn.length === 0) net.nodes.delete(n.id);
    }
    net.reindex();
  }

  function cityName(rng, style) {
    const pre = { grid: ['New ', 'North ', 'Fort ', ''], organic: ['Old ', 'Saint ', ''], suburb: ['', 'Little '], coastal: ['Port ', '', 'Bay '], mountain: ['High ', 'Peak ', ''] }[style] || [''];
    const roots = ['Ashford', 'Brookdale', 'Carlton', 'Denby', 'Eastvale', 'Farrow', 'Grantham', 'Halden', 'Kingsmere', 'Larkspur', 'Milton', 'Norwood', 'Oakhurst', 'Pemberly', 'Redcliff', 'Silverton', 'Thornbury', 'Weston'];
    return rng.pick(pre) + rng.pick(roots);
  }

  TG.generateCity = generateCity;
  TG.ZONE_COLORS = ZONE_COLORS;
  TG.BUILDING_COLORS = BUILDING_COLORS;

})(window.TG);
