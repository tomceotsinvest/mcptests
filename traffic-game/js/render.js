/* ============ GRIDLOCK — canvas renderer ============ */
'use strict';
(function (TG) {
  const { M, ROAD_TYPES } = TG;

  function heatColor(c) {
    // 0 free → 1 jammed : green → yellow → orange → red
    c = M.clamp(c, 0, 1);
    if (c < 0.35) return `rgb(${Math.round(80 + c * 320)},200,90)`;
    if (c < 0.6) return `rgb(240,${Math.round(210 - (c - 0.35) * 320)},60)`;
    return `rgb(${Math.round(240 + (c - 0.6) * 30)},${Math.round(130 - (c - 0.6) * 260)},60)`;
  }

  function Renderer(canvas, minimap) {
    const ctx = canvas.getContext('2d');
    const mctx = minimap ? minimap.getContext('2d') : null;

    const cam = {
      x: 500, y: 500, zoom: 0.8,
      tx: 500, ty: 500, tzoom: 0.8,
      minZoom: 0.045, maxZoom: 9
    };

    const R = {
      cam, canvas,
      overlays: { heat: true, pollution: false, noise: false, transit: true, paths: false, zones: false },
      followVehicle: null, selected: null, hover: null,
      toolPreview: null,     // set by tools: {pts:[..], ok, label} or {nodes:[]}
      quality: 1,
      _mmDirty: true, _mmVersion: -1
    };

    R.resize = function () {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      R.dpr = dpr;
    };

    R.screenToWorld = function (sx, sy) {
      const rect = canvas.getBoundingClientRect();
      return { x: cam.x + (sx - rect.width / 2) / cam.zoom, y: cam.y + (sy - rect.height / 2) / cam.zoom };
    };
    R.worldToScreen = function (wx, wy) {
      const rect = canvas.getBoundingClientRect();
      return { x: (wx - cam.x) * cam.zoom + rect.width / 2, y: (wy - cam.y) * cam.zoom + rect.height / 2 };
    };
    R.panBy = function (dx, dy) { cam.tx -= dx / cam.zoom; cam.ty -= dy / cam.zoom; cam.x = cam.tx; cam.y = cam.ty; };
    R.zoomAt = function (sx, sy, factor) {
      const before = R.screenToWorld(sx, sy);
      cam.tzoom = M.clamp(cam.tzoom * factor, cam.minZoom, cam.maxZoom);
      cam.zoom = cam.tzoom;
      const after = R.screenToWorld(sx, sy);
      cam.tx += before.x - after.x; cam.ty += before.y - after.y;
      cam.x = cam.tx; cam.y = cam.ty;
    };
    R.centerOn = function (x, y, zoom) {
      cam.tx = x; cam.ty = y;
      if (zoom) cam.tzoom = M.clamp(zoom, cam.minZoom, cam.maxZoom);
    };
    R.fitBounds = function (b) {
      const rect = canvas.getBoundingClientRect();
      const zx = rect.width / (b.x1 - b.x0), zy = rect.height / (b.y1 - b.y0);
      cam.tzoom = cam.zoom = M.clamp(Math.min(zx, zy) * 0.92, cam.minZoom, cam.maxZoom);
      cam.tx = cam.x = (b.x0 + b.x1) / 2;
      cam.ty = cam.y = (b.y0 + b.y1) / 2;
    };
    R.animate = function () {
      cam.x += (cam.tx - cam.x) * 0.18;
      cam.y += (cam.ty - cam.y) * 0.18;
      cam.zoom += (cam.tzoom - cam.zoom) * 0.2;
    };

    function roadBB(r) {
      if (!r._bb) {
        let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
        for (const p of r.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        r._bb = { x0, y0, x1, y1 };
      }
      return r._bb;
    }

    /** Main draw. */
    R.draw = function (game, dtMs) {
      const sim = game.sim, city = game.city, net = city.net;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);

      // follow mode
      if (R.followVehicle) {
        const v = R.followVehicle;
        if (!v.active || !v.edgeObj) R.followVehicle = null;
        else {
          const p = M.polyAt(v.edgeObj.pts, M.clamp(v.pos, 0, v.edgeObj.len));
          cam.tx = p.x; cam.ty = p.y;
        }
      }
      R.animate();

      const hour = sim.hour();
      const nightF = nightFactor(hour);
      const weather = TG.WEATHERS[sim.weather];

      // background
      const gr = Math.round(M.lerp(34, 12, nightF)), gg = Math.round(M.lerp(44, 16, nightF)), gb = Math.round(M.lerp(36, 24, nightF));
      ctx.fillStyle = `rgb(${gr},${gg},${gb})`;
      ctx.fillRect(0, 0, w, h);

      // world transform
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      const view = {
        x0: cam.x - w / 2 / cam.zoom - 50, y0: cam.y - h / 2 / cam.zoom - 50,
        x1: cam.x + w / 2 / cam.zoom + 50, y1: cam.y + h / 2 / cam.zoom + 50
      };
      const z = cam.zoom;

      drawZonesAndBuildings(city, view, z, nightF);
      drawWater(city, nightF);
      drawRail(city, z, nightF);
      drawRoads(net, sim, view, z, nightF);
      if (R.overlays.transit) drawTransit(sim, z);
      drawJunctions(net, sim, view, z);
      drawFacilities(sim, z);
      drawVehicles(sim, net, view, z, nightF);
      drawTrains(sim, z);
      drawAccidents(sim, z);
      drawSelection(sim, net, z);
      drawToolPreview(z);

      ctx.restore();

      // atmosphere
      if (nightF > 0.02) {
        ctx.fillStyle = `rgba(8,12,38,${0.42 * nightF})`;
        ctx.fillRect(0, 0, w, h);
      }
      drawWeatherFX(sim, w, h, dtMs);

      drawMinimap(game);
    };

    function nightFactor(hour) {
      if (hour >= 7 && hour <= 18) return 0;
      if (hour > 18 && hour < 21) return (hour - 18) / 3;
      if (hour >= 21 || hour < 5) return 1;
      return 1 - (hour - 5) / 2;
    }

    /* ---------- layers ---------- */
    function drawZonesAndBuildings(city, view, z, nightF) {
      const showZones = R.overlays.zones;
      if (z > 0.12) {
        for (const b of city.buildings) {
          if (b.x > view.x1 || b.y > view.y1 || b.x + b.w < view.x0 || b.y + b.h < view.y0) continue;
          if (b.park) {
            ctx.fillStyle = '#274a2f';
            if (b.poly) {
              ctx.beginPath();
              ctx.moveTo(b.poly[0].x, b.poly[0].y);
              for (const p of b.poly) ctx.lineTo(p.x, p.y);
              ctx.closePath(); ctx.fill();
            } else {
              ctx.fillRect(b.x, b.y, b.w, b.h);
            }
            continue;
          }
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, b.y, b.w, b.h);
          if (z > 0.5 && b.tall) {
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, 2);
          }
          if (nightF > 0.3 && z > 0.3) {
            // lit windows
            ctx.fillStyle = `rgba(255,220,130,${0.25 * nightF})`;
            ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, b.w * 0.18, b.h * 0.18);
            ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.5, b.w * 0.18, b.h * 0.18);
          }
          if (b.label && z > 0.35) {
            ctx.font = Math.max(8, 16) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5);
          }
        }
      }
      if (showZones) {
        for (const zn of city.zones) {
          if (zn.x0 > view.x1 || zn.y0 > view.y1 || zn.x1 < view.x0 || zn.y1 < view.y0) continue;
          ctx.fillStyle = (TG.ZONE_COLORS[zn.type] || '#333') + '55';
          ctx.fillRect(zn.x0, zn.y0, zn.x1 - zn.x0, zn.y1 - zn.y0);
        }
      }
    }

    function drawWater(city, nightF) {
      ctx.fillStyle = nightF > 0.5 ? '#0d2137' : '#1d4560';
      for (const wtr of city.water) {
        ctx.beginPath();
        ctx.moveTo(wtr.poly[0].x, wtr.poly[0].y);
        for (const p of wtr.poly) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
      }
      if (city.rocks) {
        ctx.fillStyle = '#3d4148';
        for (const rk of city.rocks) {
          ctx.beginPath();
          ctx.moveTo(rk.poly[0].x, rk.poly[0].y);
          for (const p of rk.poly) ctx.lineTo(p.x, p.y);
          ctx.closePath(); ctx.fill();
        }
      }
    }

    function drawRail(city, z, nightF) {
      if (!city.rail) return;
      for (const line of city.rail) {
        ctx.strokeStyle = '#57503f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(line.pts[0].x, line.pts[0].y);
        for (const p of line.pts) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (z > 0.3) {
          ctx.strokeStyle = '#8a7f62';
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(line.pts[0].x, line.pts[0].y);
          for (const p of line.pts) ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    function pathRoad(r) {
      ctx.beginPath();
      ctx.moveTo(r.pts[0].x, r.pts[0].y);
      for (let i = 1; i < r.pts.length; i++) ctx.lineTo(r.pts[i].x, r.pts[i].y);
    }

    function drawRoads(net, sim, view, z, nightF) {
      const heat = R.overlays.heat, poll = R.overlays.pollution, noise = R.overlays.noise;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // pass 1: casing
      if (z > 0.22) {
        for (const r of net.roads.values()) {
          const bb = roadBB(r);
          if (bb.x0 > view.x1 || bb.y0 > view.y1 || bb.x1 < view.x0 || bb.y1 < view.y0) continue;
          const t = ROAD_TYPES[r.type];
          ctx.strokeStyle = r.bridge ? '#2c3648' : '#232a36';
          ctx.lineWidth = t.width * (r.lanes / t.lanes) + (r.bridge ? 4 : 2);
          pathRoad(r); ctx.stroke();
        }
      }
      // pass 2: fill
      for (const r of net.roads.values()) {
        const bb = roadBB(r);
        if (bb.x0 > view.x1 || bb.y0 > view.y1 || bb.x1 < view.x0 || bb.y1 < view.y0) continue;
        const t = ROAD_TYPES[r.type];
        let color = t.color;
        if (r.ped) color = '#7a6a8c';
        else if (heat) {
          let cong = 0, cnt = 0;
          for (const e of [r.fwd, r.bwd]) {
            if (!e) continue;
            cong += M.clamp(1 - e.avgSpeed / r.speed, 0, 1); cnt++;
          }
          if (cnt) {
            const c = cong / cnt;
            if (c > 0.12) color = heatColor(c);
          }
        }
        if (poll) {
          let p = 0;
          for (const e of [r.fwd, r.bwd]) if (e) p = Math.max(p, e.pollution);
          color = `rgb(${Math.round(70 + p * 3)},${Math.round(90 - p)},${Math.round(120 - p * 1.5)})`;
        }
        if (noise) {
          let p = 0;
          for (const e of [r.fwd, r.bwd]) if (e) p = Math.max(p, e.noise);
          color = `rgb(${Math.round(80 + p * 2.6)},${Math.round(80 + p * 0.5)},${Math.round(150 - p)})`;
        }
        if (r.closed) color = '#5c2e34';
        if (r.tunnel) ctx.globalAlpha = 0.45;
        ctx.strokeStyle = color;
        const wpx = Math.max(t.width * (r.lanes / t.lanes) * (z < 0.22 ? 1.6 : 1), 1.2 / z);
        ctx.lineWidth = wpx;
        pathRoad(r); ctx.stroke();
        ctx.globalAlpha = 1;

        // markings + decorations at high zoom
        if (z > 0.9 && !r.ped) {
          if (r.oneway === 0 && r.type !== 'path') {
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([3, 4]);
            pathRoad(r); ctx.stroke();
            ctx.setLineDash([]);
          }
          if (r.busLane) {
            ctx.strokeStyle = 'rgba(229,72,77,0.55)';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([7, 4]);
            pathRoad(r); ctx.stroke();
            ctx.setLineDash([]);
          }
          if (r.cycleLane) {
            ctx.strokeStyle = 'rgba(60,220,130,0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 5]);
            pathRoad(r); ctx.stroke();
            ctx.setLineDash([]);
          }
          if (r.oneway !== 0) drawOnewayArrows(r, z);
          if (r.ltn) {
            ctx.strokeStyle = 'rgba(120,220,160,0.6)';
            ctx.lineWidth = 0.8;
            ctx.setLineDash([1.5, 3]);
            pathRoad(r); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        if (r.roadworks > 0 && z > 0.3) {
          const mid = M.polyAt(r.pts, r.len / 2);
          ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('🚧', mid.x, mid.y + 3);
        }
        if (r.closed && z > 0.3) {
          const mid = M.polyAt(r.pts, r.len / 2);
          ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('⛔', mid.x, mid.y + 3);
        }
      }
    }

    function drawOnewayArrows(r, z) {
      const step = Math.max(40, r.len / 4);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let d = step / 2; d < r.len; d += step) {
        const p = M.polyAt(r.oneway === 1 ? r.pts : r.pts.slice().reverse(), d);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.beginPath();
        ctx.moveTo(2.5, 0); ctx.lineTo(-1.5, -1.8); ctx.lineTo(-1.5, 1.8);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    function drawJunctions(net, sim, view, z) {
      if (z < 0.45) return;
      for (const n of net.nodes.values()) {
        if (n.x < view.x0 || n.x > view.x1 || n.y < view.y0 || n.y > view.y1) continue;
        if (n.control === 'roundabout') {
          ctx.strokeStyle = '#9aa7ba';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(n.x, n.y, 7, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#2f4a35';
          ctx.beginPath(); ctx.arc(n.x, n.y, 4.5, 0, Math.PI * 2); ctx.fill();
        } else if (n.control === 'lights') {
          const g = net.greenPhase(n, sim.time);
          ctx.fillStyle = '#222';
          ctx.fillRect(n.x - 3, n.y - 3, 6, 6);
          ctx.fillStyle = g === -1 ? '#ffb020' : '#3ddc84';
          ctx.beginPath(); ctx.arc(n.x, n.y, 1.9, 0, Math.PI * 2); ctx.fill();
        } else if (n.control === 'stop') {
          ctx.fillStyle = '#c0392b';
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2 + Math.PI / 8;
            const px = n.x + Math.cos(a) * 3, py = n.y + Math.sin(a) * 3;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath(); ctx.fill();
        }
        if (n.railCrossing && z > 0.6) {
          const closed = n.railClosedUntil && sim.time < n.railClosedUntil;
          ctx.strokeStyle = closed ? '#ff5560' : '#c9b458';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(n.x - 4, n.y - 4); ctx.lineTo(n.x + 4, n.y + 4);
          ctx.moveTo(n.x + 4, n.y - 4); ctx.lineTo(n.x - 4, n.y + 4);
          ctx.stroke();
        }
        if (n.crossing && z > 0.8) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 0.7;
          for (let i = -3; i <= 3; i += 1.5) {
            ctx.beginPath(); ctx.moveTo(n.x + i, n.y - 3); ctx.lineTo(n.x + i, n.y + 3); ctx.stroke();
          }
        }
      }
    }

    function drawTransit(sim, z) {
      for (const line of sim.transit.lines) {
        ctx.strokeStyle = line.color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = Math.max(2.2, 2.5 / z);
        const T = TG.LINE_TYPES[line.type];
        if (T.onRoad && line.path.length) {
          ctx.beginPath();
          let started = false;
          for (const eid of line.path) {
            const e = sim.net.edges.get(eid);
            if (!e) continue;
            for (let i = 0; i < e.pts.length; i++) {
              if (!started) { ctx.moveTo(e.pts[i].x, e.pts[i].y); started = true; }
              else ctx.lineTo(e.pts[i].x, e.pts[i].y);
            }
          }
          ctx.stroke();
        } else {
          ctx.setLineDash(line.type === 'metro' ? [10, 5] : [16, 8]);
          ctx.beginPath();
          const loop = line.stops.concat([line.stops[0]]);
          let started = false;
          for (const sid of loop) {
            const n = sim.net.nodes.get(sid);
            if (!n) continue;
            if (!started) { ctx.moveTo(n.x, n.y); started = true; }
            else ctx.lineTo(n.x, n.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
        // stops
        for (const sid of line.stops) {
          const n = sim.net.nodes.get(sid);
          if (!n) continue;
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(2.6, 3 / z), 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = line.color;
          ctx.lineWidth = Math.max(1.4, 1.6 / z);
          ctx.stroke();
        }
      }
    }

    function drawFacilities(sim, z) {
      if (z < 0.25) return;
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      for (const f of sim.transit.facilities) {
        const t = TG.FACILITY_TYPES[f.type];
        ctx.fillStyle = 'rgba(20,26,34,0.85)';
        ctx.beginPath(); ctx.arc(f.x, f.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#38b6ff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillText(t.icon, f.x, f.y + 4);
      }
    }

    function drawVehicles(sim, net, view, z, nightF) {
      const dots = z < 0.5;
      const laneW = 3.2;
      for (const e of sim.activeEdges) {
        const p0 = e.pts[0], p1 = e.pts[e.pts.length - 1];
        if (Math.max(p0.x, p1.x) < view.x0 || Math.min(p0.x, p1.x) > view.x1 ||
            Math.max(p0.y, p1.y) < view.y0 || Math.min(p0.y, p1.y) > view.y1) continue;
        const r = net.roads.get(e.road);
        const lanes = r ? r.lanes : 1;
        for (const v of e.vehicles) {
          const p = M.polyAt(e.pts, M.clamp(v.pos - v.len / 2, 0, e.len));
          // offset to the right side + lane offset
          const nx = Math.cos(p.angle + Math.PI / 2), ny = Math.sin(p.angle + Math.PI / 2);
          const laneOff = (v.lane === -1 ? lanes : v.lane) - (lanes - 1) / 2;
          const off = (r && r.oneway !== 0 ? laneOff * laneW : 1.7 + laneOff * laneW);
          const x = p.x + nx * off, y = p.y + ny * off;
          if (dots) {
            ctx.fillStyle = v.type === 'bus' || v.type === 'tram' ? v.color : (v.vel < 1.5 ? '#ff5560' : '#e8e6e3');
            ctx.fillRect(x - 1.6 / z, y - 1.6 / z, 3.2 / z, 3.2 / z);
            continue;
          }
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.angle);
          ctx.fillStyle = v.color;
          const vw = v.type === 'truck' || v.type === 'bus' || v.type === 'tram' ? 2.6 : 2;
          ctx.fillRect(-v.len / 2, -vw / 2, v.len, vw);
          if (v.emergency) {
            ctx.fillStyle = (sim._tickId % 10 < 5) ? '#0091ff' : '#ff2030';
            ctx.fillRect(-1, -vw / 2, 2, vw);
          }
          if (nightF > 0.25) {
            ctx.fillStyle = `rgba(255,240,180,${0.7 * nightF})`;
            ctx.fillRect(v.len / 2 - 0.6, -vw / 2, 0.6, 0.7);
            ctx.fillRect(v.len / 2 - 0.6, vw / 2 - 0.7, 0.6, 0.7);
            ctx.fillStyle = `rgba(255,60,60,${0.6 * nightF})`;
            ctx.fillRect(-v.len / 2, -vw / 2, 0.5, 0.7);
            ctx.fillRect(-v.len / 2, vw / 2 - 0.7, 0.5, 0.7);
          }
          ctx.restore();
        }
      }
    }

    function drawTrains(sim, z) {
      for (const t of sim.trains) {
        if (t.x === undefined) continue;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);
        ctx.fillStyle = '#c9b458';
        for (let c = 0; c < 4; c++) ctx.fillRect(-40 + c * 20, -2.2, 17, 4.4);
        ctx.restore();
      }
    }

    function drawAccidents(sim, z) {
      ctx.font = Math.max(10, 14 / Math.max(z, 0.6)) + 'px sans-serif';
      ctx.textAlign = 'center';
      for (const a of sim.accidents) {
        const pulse = 1 + 0.15 * Math.sin(performance.now() / 200);
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.scale(pulse, pulse);
        ctx.fillText(a.breakdown ? '🔧' : '💥', 0, 4);
        ctx.restore();
      }
    }

    function drawSelection(sim, net, z) {
      const sel = R.selected;
      if (!sel) return;
      ctx.strokeStyle = '#38b6ff';
      ctx.lineWidth = Math.max(2, 3 / z);
      if (sel.kind === 'road' && net.roads.has(sel.road.id)) {
        ctx.globalAlpha = 0.85;
        pathRoad(sel.road); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (sel.kind === 'node' && net.nodes.has(sel.node.id)) {
        ctx.beginPath(); ctx.arc(sel.node.x, sel.node.y, 9, 0, Math.PI * 2); ctx.stroke();
      } else if (sel.kind === 'vehicle' && sel.vehicle.active && sel.vehicle.edgeObj) {
        const v = sel.vehicle;
        const p = M.polyAt(v.edgeObj.pts, M.clamp(v.pos, 0, v.edgeObj.len));
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
        if (R.overlays.paths && v.route) {
          ctx.strokeStyle = 'rgba(56,182,255,0.6)';
          ctx.lineWidth = Math.max(1.5, 2 / z);
          ctx.beginPath();
          let started = false;
          for (let i = v.ri; i < v.route.length; i++) {
            const e = net.edges.get(v.route[i]);
            if (!e) continue;
            for (const pt of e.pts) {
              if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
              else ctx.lineTo(pt.x, pt.y);
            }
          }
          ctx.stroke();
        }
      } else if (sel.kind === 'line') {
        // handled by transit overlay (line always drawn); highlight stops
        for (const sid of sel.line.stops) {
          const n = net.nodes.get(sid);
          if (n) { ctx.beginPath(); ctx.arc(n.x, n.y, 7, 0, Math.PI * 2); ctx.stroke(); }
        }
      }
    }

    function drawToolPreview(z) {
      const tp = R.toolPreview;
      if (!tp) return;
      if (tp.pts && tp.pts.length > 1) {
        ctx.strokeStyle = tp.ok ? 'rgba(61,220,132,0.85)' : 'rgba(255,85,96,0.85)';
        ctx.lineWidth = tp.width || 6;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(tp.pts[0].x, tp.pts[0].y);
        for (const p of tp.pts) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (tp.nodes) {
        for (const n of tp.nodes) {
          ctx.fillStyle = 'rgba(56,182,255,0.9)';
          ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(4, 5 / z), 0, Math.PI * 2); ctx.fill();
        }
      }
      if (tp.circle) {
        ctx.strokeStyle = 'rgba(56,182,255,0.5)';
        ctx.lineWidth = 1.5 / z;
        ctx.beginPath(); ctx.arc(tp.circle.x, tp.circle.y, tp.circle.r, 0, Math.PI * 2); ctx.stroke();
      }
    }

    /* ---------- weather fx ---------- */
    let rainDrops = null, snowFlakes = null;
    function drawWeatherFX(sim, w, h, dtMs) {
      const wx = sim.weather;
      if (wx === 'rain' || wx === 'heavyrain') {
        if (!rainDrops) {
          rainDrops = [];
          for (let i = 0; i < 160; i++) rainDrops.push({ x: Math.random() * w, y: Math.random() * h, s: 6 + Math.random() * 8 });
        }
        const n = wx === 'heavyrain' ? rainDrops.length : rainDrops.length / 2;
        ctx.strokeStyle = 'rgba(160,190,230,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const d = rainDrops[i];
          d.y += d.s; d.x += d.s * 0.3;
          if (d.y > h) { d.y = -10; d.x = Math.random() * w; }
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 2.5, d.y - 9);
        }
        ctx.stroke();
      } else if (wx === 'snow' || wx === 'ice') {
        if (!snowFlakes) {
          snowFlakes = [];
          for (let i = 0; i < 120; i++) snowFlakes.push({ x: Math.random() * w, y: Math.random() * h, s: 0.6 + Math.random() * 1.4, ph: Math.random() * 6 });
        }
        ctx.fillStyle = 'rgba(240,245,255,0.7)';
        for (const f of snowFlakes) {
          f.y += f.s; f.ph += 0.02; f.x += Math.sin(f.ph) * 0.4;
          if (f.y > h) { f.y = -4; f.x = Math.random() * w; }
          ctx.fillRect(f.x, f.y, 1.6, 1.6);
        }
        if (wx === 'ice') { ctx.fillStyle = 'rgba(180,220,255,0.05)'; ctx.fillRect(0, 0, w, h); }
      } else if (wx === 'fog') {
        ctx.fillStyle = 'rgba(190,200,210,0.22)';
        ctx.fillRect(0, 0, w, h);
      }
    }

    /* ---------- minimap ---------- */
    let mmCache = null;
    R.invalidateMinimap = function () { R._mmDirty = true; };
    function drawMinimap(game) {
      if (!mctx) return;
      const net = game.city.net;
      const mw = minimap.width, mh = minimap.height;
      const b = net.bounds;
      const sx = mw / (b.x1 - b.x0), sy = mh / (b.y1 - b.y0);
      const s = Math.min(sx, sy);
      if (R._mmDirty || R._mmVersion !== net.version) {
        R._mmDirty = false; R._mmVersion = net.version;
        if (!mmCache) { mmCache = document.createElement('canvas'); mmCache.width = mw; mmCache.height = mh; }
        const c = mmCache.getContext('2d');
        c.fillStyle = '#151a22'; c.fillRect(0, 0, mw, mh);
        c.fillStyle = '#1d4560';
        for (const wtr of game.city.water) {
          c.beginPath();
          c.moveTo((wtr.poly[0].x - b.x0) * s, (wtr.poly[0].y - b.y0) * s);
          for (const p of wtr.poly) c.lineTo((p.x - b.x0) * s, (p.y - b.y0) * s);
          c.closePath(); c.fill();
        }
        for (const r of net.roads.values()) {
          c.strokeStyle = r.type === 'motorway' ? '#a8b6cc' : r.type === 'arterial' ? '#66738a' : '#3a4356';
          c.lineWidth = r.type === 'motorway' ? 1.6 : r.type === 'arterial' ? 1.2 : 0.6;
          c.beginPath();
          c.moveTo((r.pts[0].x - b.x0) * s, (r.pts[0].y - b.y0) * s);
          for (const p of r.pts) c.lineTo((p.x - b.x0) * s, (p.y - b.y0) * s);
          c.stroke();
        }
      }
      mctx.drawImage(mmCache, 0, 0);
      // congested edges live
      mctx.fillStyle = 'rgba(255,85,96,0.8)';
      for (const e of game.sim.activeEdges) {
        const r = net.roads.get(e.road);
        if (!r) continue;
        if (e.avgSpeed < r.speed * 0.4 && e.vehicles.length > 1) {
          const p = e.pts[0];
          mctx.fillRect((p.x - b.x0) * s - 1, (p.y - b.y0) * s - 1, 2, 2);
        }
      }
      // viewport
      const rect = canvas.getBoundingClientRect();
      const vw = rect.width / cam.zoom * s, vh = rect.height / cam.zoom * s;
      mctx.strokeStyle = '#38b6ff';
      mctx.lineWidth = 1;
      mctx.strokeRect((cam.x - b.x0) * s - vw / 2, (cam.y - b.y0) * s - vh / 2, vw, vh);
    }
    R.minimapToWorld = function (mx, my, net) {
      const b = net.bounds;
      const s = Math.min(minimap.width / (b.x1 - b.x0), minimap.height / (b.y1 - b.y0));
      return { x: mx / s + b.x0, y: my / s + b.y0 };
    };

    R.heatColor = heatColor;
    return R;
  }

  TG.Renderer = Renderer;

})(window.TG);
