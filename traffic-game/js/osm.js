/* ============ GRIDLOCK — real-world map import (OpenStreetMap / Overpass) ============ */
'use strict';
(function (TG) {
  const { M, RNG, Network } = TG;

  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

  /** Geocode a place name → {lat, lon, name}. */
  async function geocode(query) {
    const url = NOMINATIM + '?format=json&limit=1&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Geocoding failed (' + res.status + ')');
    const data = await res.json();
    if (!data.length) throw new Error('Place not found: ' + query);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name.split(',').slice(0, 2).join(',') };
  }

  /** Parse "lat,lon" or a maps link containing @lat,lon. */
  function parseCoords(text) {
    let m = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!m) m = text.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  }

  function buildQuery(lat, lon, radius) {
    const around = `(around:${radius},${lat},${lon})`;
    return `[out:json][timeout:60];(
      way[highway~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|pedestrian)$"]${around};
      way[waterway=riverbank]${around};
      way[natural=water]${around};
      way[landuse~"^(residential|commercial|industrial|retail|forest|grass|recreation_ground)$"]${around};
      way[leisure~"^(park|pitch|stadium)$"]${around};
      way[railway=rail]${around};
      node[highway=traffic_signals]${around};
      way[amenity~"^(school|hospital)$"]${around};
      way[building][amenity~"^(school|hospital)$"]${around};
    );out body geom 20000;`;
  }

  async function fetchOverpass(lat, lon, radius, onStatus) {
    const q = buildQuery(lat, lon, radius);
    let lastErr = null;
    for (const ep of OVERPASS_ENDPOINTS) {
      try {
        onStatus && onStatus('Querying ' + new URL(ep).host + '…');
        const res = await fetch(ep, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(q),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (!res.ok) throw new Error('Overpass HTTP ' + res.status);
        return await res.json();
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('Overpass unavailable');
  }

  const HW_MAP = {
    motorway: { type: 'motorway', speed: 27.8, lanes: 3 },
    motorway_link: { type: 'arterial', speed: 19.4, lanes: 1 },
    trunk: { type: 'motorway', speed: 25, lanes: 2 },
    trunk_link: { type: 'arterial', speed: 16.7, lanes: 1 },
    primary: { type: 'arterial', speed: 16.7, lanes: 2 },
    primary_link: { type: 'arterial', speed: 13.9, lanes: 1 },
    secondary: { type: 'arterial', speed: 13.9, lanes: 1 },
    secondary_link: { type: 'local', speed: 13.9, lanes: 1 },
    tertiary: { type: 'local', speed: 13.9, lanes: 1 },
    tertiary_link: { type: 'local', speed: 11.1, lanes: 1 },
    residential: { type: 'local', speed: 8.3, lanes: 1 },
    unclassified: { type: 'local', speed: 11.1, lanes: 1 },
    living_street: { type: 'local', speed: 5.6, lanes: 1 },
    pedestrian: { type: 'local', speed: 4, lanes: 1, ped: true }
  };
  const LANDUSE_ZONE = {
    residential: 'residential', commercial: 'commercial', industrial: 'industrial',
    retail: 'retail', forest: 'park', grass: 'park', recreation_ground: 'park',
    park: 'park', pitch: 'park', stadium: 'stadium', school: 'school', hospital: 'hospital'
  };

  /**
   * Import a real city. opts: { query | coords, radius, population, onStatus }
   * Returns same shape as generateCity.
   */
  async function importCity(opts) {
    const onStatus = opts.onStatus || (() => {});
    let center, placeName = 'Imported city';
    if (opts.coords) { center = opts.coords; placeName = 'Lat ' + center.lat.toFixed(3) + ', ' + center.lon.toFixed(3); }
    else {
      onStatus('Searching for “' + opts.query + '”…');
      const g = await geocode(opts.query);
      center = g; placeName = g.name;
    }
    const radius = opts.radius || 800;
    const osm = await fetchOverpass(center.lat, center.lon, radius, onStatus);
    onStatus('Building road network… (' + osm.elements.length + ' OSM elements)');

    // local equirectangular projection, metres, y grows south→down
    const mPerLat = 111320;
    const mPerLon = Math.cos(center.lat * Math.PI / 180) * 111320;
    const proj = (lat, lon) => ({ x: (lon - center.lon) * mPerLon + radius * 1.1, y: (center.lat - lat) * mPerLat + radius * 1.1 });

    Network.resetIds();
    const net = Network();
    const W = radius * 2.2, H = radius * 2.2;
    net.bounds = { x0: -80, y0: -80, x1: W + 80, y1: H + 80 };

    const signalNodes = [];
    const water = [], rail = [], landPolys = [];
    const ways = [];
    for (const el of osm.elements) {
      if (el.type === 'node' && el.tags && el.tags.highway === 'traffic_signals') {
        signalNodes.push(proj(el.lat, el.lon));
        continue;
      }
      if (el.type !== 'way' || !el.geometry) continue;
      const tags = el.tags || {};
      const pts = el.geometry.map(g => proj(g.lat, g.lon));
      if (tags.highway && HW_MAP[tags.highway]) {
        ways.push({ pts, tags, hw: HW_MAP[tags.highway] });
      } else if (tags.waterway === 'riverbank' || tags.natural === 'water') {
        if (pts.length > 2) water.push({ poly: pts });
      } else if (tags.railway === 'rail') {
        rail.push({ pts });
      } else {
        const zt = LANDUSE_ZONE[tags.landuse] || LANDUSE_ZONE[tags.leisure] || LANDUSE_ZONE[tags.amenity];
        if (zt && pts.length > 2) landPolys.push({ poly: pts, type: zt });
      }
    }
    if (!ways.length) throw new Error('No roads found here — try a different location or a bigger radius.');

    // shared nodes: snap way endpoints & intersections by coordinate key (~6 m grid)
    const nodeByKey = new Map();
    const getNode = (p) => {
      const k = Math.round(p.x / 6) + ':' + Math.round(p.y / 6);
      let n = nodeByKey.get(k);
      if (!n) { n = net.addNode(p.x, p.y); nodeByKey.set(k, n); }
      return n;
    };
    // detect internal shared points: count usage of coordinate keys across ways
    const useCount = new Map();
    for (const w of ways) {
      for (const p of w.pts) {
        const k = Math.round(p.x / 6) + ':' + Math.round(p.y / 6);
        useCount.set(k, (useCount.get(k) || 0) + 1);
      }
    }
    for (const w of ways) {
      const t = w.tags;
      const oneway = t.oneway === 'yes' || t.oneway === '1' ? 1 : (t.oneway === '-1' ? -1 : (t.junction === 'roundabout' ? 1 : 0));
      let speed = w.hw.speed;
      if (t.maxspeed) {
        const ms = parseInt(t.maxspeed, 10);
        if (!isNaN(ms)) speed = /mph/.test(t.maxspeed) ? ms * 0.447 : ms / 3.6;
      }
      let lanes = w.hw.lanes;
      if (t.lanes) { const ln = parseInt(t.lanes, 10); if (!isNaN(ln)) lanes = M.clamp(Math.ceil(ln / (oneway ? 1 : 2)), 1, 4); }
      // split way at internal shared nodes so junctions exist
      let segStart = 0;
      for (let i = 1; i < w.pts.length; i++) {
        const k = Math.round(w.pts[i].x / 6) + ':' + Math.round(w.pts[i].y / 6);
        const isEnd = i === w.pts.length - 1;
        if ((useCount.get(k) > 1) || isEnd) {
          const a = getNode(w.pts[segStart]), b = getNode(w.pts[i]);
          if (a !== b) {
            const pts = w.pts.slice(segStart, i + 1).map(p => ({ x: p.x, y: p.y }));
            const rd = net.addRoad(a, b, pts, w.hw.type, {
              oneway, speed, lanes,
              ped: !!w.hw.ped || t.highway === 'pedestrian',
              busLane: t.busway ? true : false,
              cycleLane: !!t.cycleway,
              bridge: t.bridge === 'yes', tunnel: t.tunnel === 'yes',
              name: t.name || ''
            });
            if (t.junction === 'roundabout') { net.nodes.get(rd.a).control = 'roundabout'; net.nodes.get(rd.b).control = 'roundabout'; }
          }
          segStart = i;
        }
      }
    }

    // apply OSM traffic signals to nearest junctions
    for (const sp of signalNodes) {
      const n = net.nearestNode(sp.x, sp.y, 25);
      if (n && n.inn.length >= 3 && n.control !== 'lights') net.setLights(n, true);
    }

    // prune tiny disconnected fragments
    pruneToLargest(net);

    // zones from landuse polygons; fill gaps with residential blobs near roads
    const rng = RNG(1234);
    const zones = [], buildings = [], pois = [];
    for (const lp of landPolys.slice(0, 400)) {
      let cx = 0, cy = 0;
      for (const p of lp.poly) { cx += p.x; cy += p.y; }
      cx /= lp.poly.length; cy /= lp.poly.length;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of lp.poly) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      if ((x1 - x0) * (y1 - y0) < 400) continue;
      const z = { id: zones.length + 1, type: lp.type, cx, cy, x0, y0, x1, y1, poly: lp.poly, pop: 0, jobs: 0, anchors: [] };
      zones.push(z);
      if (lp.type === 'school' || lp.type === 'hospital' || lp.type === 'stadium') pois.push({ type: lp.type, x: cx, y: cy, zone: z.id });
      if (lp.type !== 'park') {
        const n = Math.min(4, Math.ceil((x1 - x0) * (y1 - y0) / 5000));
        for (let i = 0; i < n; i++) {
          const bw = rng.range(14, 30), bh = rng.range(14, 30);
          buildings.push({ x: rng.range(x0, Math.max(x0 + 1, x1 - bw)), y: rng.range(y0, Math.max(y0 + 1, y1 - bh)), w: bw, h: bh, color: (TG.BUILDING_COLORS[lp.type] || TG.BUILDING_COLORS.residential)[0], zone: z.id });
        }
      } else {
        buildings.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, color: TG.ZONE_COLORS.park, park: true, zone: z.id, poly: lp.poly });
      }
    }
    // synthetic residential/office zones seeded on the network so demand always exists
    const nodeArr = [...net.nodes.values()].filter(n => n.out.length > 0);
    const synth = Math.max(14, Math.floor(nodeArr.length / 40));
    for (let i = 0; i < synth; i++) {
      const n = rng.pick(nodeArr);
      const type = i % 3 === 0 ? (i % 6 === 0 ? 'office' : 'commercial') : 'residential';
      zones.push({ id: zones.length + 1, type, cx: n.x, cy: n.y, x0: n.x - 40, y0: n.y - 40, x1: n.x + 40, y1: n.y + 40, pop: 0, jobs: 0, anchors: [n.id], synthetic: true });
    }

    for (const z of zones) {
      if (z.anchors.length) continue;
      const cand = [];
      net.nodeHash.query(z.cx, z.cy, 220, cand);
      cand.sort((a, b) => M.dist2(z.cx, z.cy, a.x, a.y) - M.dist2(z.cx, z.cy, b.x, b.y));
      z.anchors = cand.filter(n => n.out.length > 0).slice(0, 4).map(n => n.id);
    }
    for (let i = zones.length - 1; i >= 0; i--) if (!zones[i].anchors.length) zones.splice(i, 1);

    // population
    const resZ = zones.filter(z => z.type === 'residential');
    const jobZ = zones.filter(z => z.type !== 'residential' && z.type !== 'park');
    const pop = opts.population || 20000;
    resZ.forEach(z => z.pop = Math.round(pop / Math.max(1, resZ.length)));
    jobZ.forEach(z => z.jobs = Math.round(pop * 0.55 / Math.max(1, jobZ.length)));

    onStatus('Done — ' + net.roads.size + ' roads, ' + net.nodes.size + ' junctions.');
    return { net, zones, buildings, water, rocks: [], rail, pois, name: placeName, W, H, imported: true };
  }

  function pruneToLargest(net) {
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const n of net.nodes.keys()) parent.set(n, n);
    for (const r of net.roads.values()) {
      const ra = find(r.a), rb = find(r.b);
      if (ra !== rb) parent.set(ra, rb);
    }
    const size = new Map();
    for (const n of net.nodes.keys()) { const rt = find(n); size.set(rt, (size.get(rt) || 0) + 1); }
    let big = null, bs = 0;
    for (const [rt, s] of size) if (s > bs) { bs = s; big = rt; }
    for (const r of [...net.roads.values()]) if (find(r.a) !== big) net.removeRoad(r);
    for (const n of [...net.nodes.values()]) if (!n.out.length && !n.inn.length) net.nodes.delete(n.id);
    net.reindex();
  }

  TG.osm = { geocode, parseCoords, importCity };

})(window.TG);
