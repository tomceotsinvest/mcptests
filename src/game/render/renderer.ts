import { RoadClass } from '../types';
import type { Vec } from '../types';
import type { Engine } from '../sim/engine';
import { applyTransform, Camera, worldToScreen } from './camera';
import { daylight } from '../sim/weather';
import { MIN_PER_DAY } from '../constants';

/**
 * Canvas renderer. All static geometry is baked into Path2D objects once,
 * then stroked/filled per frame under the camera transform — panning and
 * zooming cost a handful of draw calls.
 */
export class Renderer {
  private roadPaths = new Map<RoadClass, Path2D>();
  private busLanePath = new Path2D();
  private thamesPath = new Path2D();
  private parkPaths: Path2D;
  private railPath = new Path2D();
  private boroughPath = new Path2D();
  private particles: { x: number; y: number; s: number }[] = [];

  constructor(private engine: Engine) {
    const map = engine.map;
    for (const cls of [RoadClass.Motorway, RoadClass.A, RoadClass.B, RoadClass.Residential, RoadClass.Pedestrian]) {
      this.roadPaths.set(cls, new Path2D());
    }
    for (const e of map.edges) {
      const p = this.roadPaths.get(e.cls)!;
      const a = map.nodes[e.a].p;
      const b = map.nodes[e.b].p;
      p.moveTo(a.x, a.y);
      p.lineTo(b.x, b.y);
      if (e.busLane) {
        this.busLanePath.moveTo(a.x, a.y);
        this.busLanePath.lineTo(b.x, b.y);
      }
    }
    this.thamesPath.moveTo(map.thames[0].x, map.thames[0].y);
    for (let i = 1; i < map.thames.length; i++) this.thamesPath.lineTo(map.thames[i].x, map.thames[i].y);
    this.parkPaths = new Path2D();
    for (const park of map.parks) {
      this.parkPaths.moveTo(park.poly[0].x, park.poly[0].y);
      for (let i = 1; i < park.poly.length; i++) this.parkPaths.lineTo(park.poly[i].x, park.poly[i].y);
      this.parkPaths.closePath();
    }
    for (const line of map.rail) {
      this.railPath.moveTo(line[0].x, line[0].y);
      for (let i = 1; i < line.length; i++) this.railPath.lineTo(line[i].x, line[i].y);
    }
    for (const line of map.boroughs) {
      this.boroughPath.moveTo(line[0].x, line[0].y);
      for (let i = 1; i < line.length; i++) this.boroughPath.lineTo(line[i].x, line[i].y);
    }
    for (let i = 0; i < 130; i++) {
      this.particles.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() });
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const engine = this.engine;
    const cam = engine.camera as Camera;
    const zoom = cam.zoom;
    const day = Math.floor(engine.minute / MIN_PER_DAY);
    const dl = daylight(engine.minute, day);
    const night = 1 - dl;

    /* ---- background ---- */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = mix('#e8e6df', '#1a2030', night * 0.85);
    ctx.fillRect(0, 0, w, h);

    applyTransform(ctx, cam, w, h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // boroughs (subtle)
    ctx.strokeStyle = mix('#d8d2c4', '#232a3c', night * 0.8);
    ctx.lineWidth = 26;
    ctx.setLineDash([120, 90]);
    ctx.stroke(this.boroughPath);
    ctx.setLineDash([]);

    // parks
    ctx.fillStyle = mix('#c5dfb4', '#1c2f22', night * 0.85);
    ctx.fill(this.parkPaths);

    // Thames
    ctx.strokeStyle = mix('#9ec8e8', '#16273c', night * 0.8);
    ctx.lineWidth = engine.map.thamesWidth;
    ctx.stroke(this.thamesPath);

    // national rail (hatched grey)
    ctx.strokeStyle = mix('#b9b3a8', '#2c3345', night * 0.7);
    ctx.lineWidth = 14;
    ctx.setLineDash([60, 40]);
    ctx.stroke(this.railPath);
    ctx.setLineDash([]);

    /* ---- roads (LOD) ---- */
    const roadCol = (base: string) => mix(base, '#333c52', night * 0.75);
    if (zoom > 0.11) {
      ctx.strokeStyle = roadCol('#ffffff');
      ctx.lineWidth = Math.max(6, 1.2 / zoom);
      ctx.stroke(this.roadPaths.get(RoadClass.Residential)!);
    }
    ctx.strokeStyle = roadCol('#f7f3e8');
    ctx.lineWidth = Math.max(12, 1.6 / zoom);
    ctx.stroke(this.roadPaths.get(RoadClass.B)!);
    ctx.strokeStyle = roadCol('#f8d98e');
    ctx.lineWidth = Math.max(20, 2.2 / zoom);
    ctx.stroke(this.roadPaths.get(RoadClass.A)!);
    ctx.strokeStyle = roadCol('#f0b46a');
    ctx.lineWidth = Math.max(26, 2.6 / zoom);
    ctx.stroke(this.roadPaths.get(RoadClass.Motorway)!);
    if (zoom > 0.2) {
      ctx.strokeStyle = 'rgba(200,60,60,0.35)';
      ctx.lineWidth = 5;
      ctx.stroke(this.busLanePath);
      ctx.strokeStyle = roadCol('#e8e2d2');
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.stroke(this.roadPaths.get(RoadClass.Pedestrian)!);
      ctx.setLineDash([]);
    }

    /* ---- overlays under network ---- */
    if (engine.overlay === 'demand') this.drawDemand(ctx);
    if (engine.overlay === 'congestion') this.drawCongestion(ctx);

    /* ---- routes ---- */
    const selected = engine.selectedRoute;
    for (const r of engine.net.routes) {
      if (!r || r.path.length < 2) continue;
      const path = new Path2D();
      path.moveTo(r.path[0].x, r.path[0].y);
      for (let i = 1; i < r.path.length; i++) path.lineTo(r.path[i].x, r.path[i].y);
      const rw =
        r.mode === 'tube' ? px(3.4, zoom, 10, 34) : r.mode === 'boat' ? px(2.8, zoom, 9, 26) : px(2.2, zoom, 7, 20);
      if (r.id === selected) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = rw * 1.7;
        ctx.stroke(path);
      }
      ctx.strokeStyle = r.active ? r.color : 'rgba(120,120,120,0.6)';
      ctx.lineWidth = rw;
      ctx.globalAlpha = r.mode === 'tube' ? 0.92 : 0.85;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }

    /* ---- draft ---- */
    const draft = engine.draft;
    if (draft && draft.path.length > 1) {
      const path = new Path2D();
      path.moveTo(draft.path[0].x, draft.path[0].y);
      for (let i = 1; i < draft.path.length; i++) path.lineTo(draft.path[i].x, draft.path[i].y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = px(2.6, zoom, 8, 24);
      ctx.setLineDash([60, 40]);
      ctx.stroke(path);
      ctx.setLineDash([]);
    }
    if (draft) {
      const rr = px(9, zoom, 10, 80);
      for (const sid of draft.stops) {
        const s = engine.net.stops[sid];
        if (!s) continue;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.p.x, s.p.y, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = rr * 0.3;
        ctx.stroke();
      }
    }

    /* ---- stops & stations ---- */
    if (zoom > 0.1) {
      const tubeR = px(7, zoom, 8, 63);
      const stopR = px(6, zoom, 5, 32);
      const barW = px(4, zoom, 3, 26);
      for (const s of engine.net.stops) {
        if (!s) continue;
        const closed = s.closedUntil > engine.minute;
        if (s.mode === 'tube') {
          ctx.fillStyle = closed ? '#d33' : '#ffffff';
          ctx.beginPath();
          ctx.arc(s.p.x, s.p.y, tubeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#c02020';
          ctx.lineWidth = tubeR * 0.42;
          ctx.beginPath();
          ctx.arc(s.p.x, s.p.y, tubeR * 0.95, 0, Math.PI * 2);
          ctx.stroke();
        } else if (zoom > 0.16) {
          ctx.fillStyle = closed ? '#d33' : s.mode === 'boat' ? '#1b6ca8' : '#333';
          ctx.fillRect(s.p.x - stopR / 2, s.p.y - stopR / 2, stopR, stopR);
        }
        // waiting queue bar
        if (zoom > 0.3) {
          const q = engine.agents.waiting.get(s.id);
          if (q && q.length) {
            ctx.fillStyle = q.length > 40 ? '#e03030' : '#e0a020';
            ctx.fillRect(s.p.x + stopR, s.p.y, barW, Math.min(60, q.length * 2) * barW * 0.25);
          }
        }
      }
    }

    /* ---- piers hint in boat mode ---- */
    if (engine.tool === 'boatRoute') {
      const rr = px(11, zoom, 14, 110);
      for (const pier of engine.map.piers) {
        ctx.fillStyle = 'rgba(27,108,168,0.85)';
        ctx.beginPath();
        ctx.arc(pier.p.x, pier.p.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* ---- coverage overlay ---- */
    if (engine.overlay === 'coverage') {
      ctx.fillStyle = 'rgba(40,140,60,0.14)';
      for (const s of engine.net.stops) {
        if (!s) continue;
        ctx.beginPath();
        ctx.arc(s.p.x, s.p.y, 420, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* ---- walking agents (sampled) ---- */
    if (zoom > 0.18) {
      ctx.fillStyle = mix('#3a3a3a', '#cfd6ea', night * 0.8);
      const dot = px(3.5, zoom, 2.5, 12);
      let drawn = 0;
      for (const agent of engine.agents.agents.values()) {
        if (agent.state !== 'walkToStop' && agent.state !== 'walkFinal') continue;
        ctx.fillRect(agent.p.x - dot / 2, agent.p.y - dot / 2, dot, dot);
        if (++drawn > 1600) break;
      }
    }

    /* ---- ambient traffic ---- */
    if (zoom > 0.09) {
      for (const car of engine.ambient.cars) {
        const kinds = ['#cbd2dd', '#e8c840', '#b8c4c8', '#68a8d8'];
        ctx.fillStyle = kinds[car.kind];
        const len = car.kind === 3 ? 4 : 9;
        ctx.save();
        ctx.translate(car.p.x, car.p.y);
        ctx.rotate(car.heading);
        ctx.fillRect(-len / 2, -3, len, 6);
        if (night > 0.5 && car.kind !== 3) {
          ctx.fillStyle = 'rgba(255,240,170,0.9)';
          ctx.fillRect(len / 2, -2.5, 3, 5);
        }
        ctx.restore();
      }
    }

    /* ---- vehicles ---- */
    for (const v of engine.net.vehicles.values()) {
      const r = engine.net.routes[v.routeId];
      if (!r) continue;
      const len = r.mode === 'tube' ? 88 : r.mode === 'boat' ? 34 : 14;
      const wid = r.mode === 'tube' ? 16 : r.mode === 'boat' ? 12 : 7;
      const minLenPx = 7;
      const scale = Math.max(1, minLenPx / (len * zoom));
      ctx.save();
      ctx.translate(v.p.x, v.p.y);
      ctx.rotate(v.heading);
      ctx.scale(scale, scale);
      ctx.fillStyle = r.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-len / 2, -wid / 2, len, wid);
      ctx.fill();
      ctx.stroke();
      // occupancy pip
      if (zoom > 0.25) {
        ctx.fillStyle = v.occupancy > 0.85 ? '#e03030' : v.occupancy > 0.5 ? '#e0a020' : '#30b050';
        ctx.fillRect(len / 2 - 5, -wid / 2, 5, wid);
      }
      if (night > 0.5) {
        ctx.fillStyle = 'rgba(255,240,170,0.95)';
        ctx.fillRect(len / 2, -wid / 3, 4, (wid * 2) / 3);
      }
      ctx.restore();
    }

    /* ---- labels (screen space) ---- */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (zoom > 0.13) this.drawLandmarks(ctx, cam, w, h, night);
    if (zoom > 0.3) this.drawStationLabels(ctx, cam, w, h, night);

    /* ---- night tint & weather ---- */
    if (night > 0.02) {
      ctx.fillStyle = `rgba(8, 12, 38, ${night * 0.34})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawWeather(ctx, w, h);
  }

  private drawLandmarks(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number, night: number): void {
    ctx.font = `${Math.max(14, Math.min(26, cam.zoom * 60))}px system-ui`;
    ctx.textAlign = 'center';
    for (const lmk of this.engine.map.landmarks) {
      const s = worldToScreen(cam, w, h, lmk.p);
      if (s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40) continue;
      ctx.fillText(lmk.icon, s.x, s.y);
      if (cam.zoom > 0.34) {
        ctx.font = '11px system-ui';
        ctx.fillStyle = night > 0.5 ? 'rgba(220,225,240,0.85)' : 'rgba(60,60,60,0.85)';
        ctx.fillText(lmk.name, s.x, s.y + 14);
        ctx.font = `${Math.max(14, Math.min(26, cam.zoom * 60))}px system-ui`;
      }
    }
  }

  private drawStationLabels(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number, night: number): void {
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = night > 0.5 ? 'rgba(225,230,245,0.9)' : 'rgba(30,30,60,0.9)';
    for (const stop of this.engine.net.stops) {
      if (!stop || stop.mode !== 'tube') continue;
      const s = worldToScreen(cam, w, h, stop.p);
      if (s.x < -80 || s.x > w + 80 || s.y < -20 || s.y > h + 20) continue;
      ctx.fillText(stop.name, s.x + 8, s.y - 6);
    }
  }

  private drawDemand(ctx: CanvasRenderingContext2D): void {
    const map = this.engine.map;
    let max = 0.001;
    for (const z of map.zones) max = Math.max(max, z.res + z.jobs + z.attract);
    for (const z of map.zones) {
      const v = (z.res + z.jobs + z.attract) / max;
      if (v < 0.06) continue;
      ctx.fillStyle = `rgba(220, 40, 40, ${Math.min(0.5, v * 0.55)})`;
      ctx.fillRect(z.cx - map.zoneSize / 2, z.cy - map.zoneSize / 2, map.zoneSize, map.zoneSize);
    }
  }

  private drawCongestion(ctx: CanvasRenderingContext2D): void {
    const idx = this.engine.congestion;
    const r = Math.round(80 + idx * 175);
    const g = Math.round(200 - idx * 160);
    ctx.strokeStyle = `rgba(${r}, ${g}, 40, 0.55)`;
    ctx.lineWidth = 30;
    ctx.stroke(this.roadPaths.get(RoadClass.A)!);
    ctx.stroke(this.roadPaths.get(RoadClass.Motorway)!);
  }

  private drawWeather(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const kind = this.engine.weather.kind;
    if (kind === 'rain' || kind === 'heavyRain' || kind === 'storm' || kind === 'snow') {
      const heavy = kind !== 'rain';
      const snow = kind === 'snow';
      const t = performance.now() * 0.001;
      ctx.strokeStyle = snow ? 'rgba(255,255,255,0.8)' : 'rgba(140,170,220,0.5)';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      const n = heavy ? this.particles.length : this.particles.length / 2;
      for (let i = 0; i < n; i++) {
        const pt = this.particles[i];
        const speed = snow ? 0.03 : 0.25;
        const px = ((pt.x + t * 0.02 * pt.s) % 1) * w;
        const py = ((pt.y + t * speed * pt.s) % 1) * h;
        if (snow) {
          ctx.fillRect(px, py, 3, 3);
        } else {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - 2, py + 10);
          ctx.stroke();
        }
      }
      if (kind === 'storm' && Math.random() < 0.004) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(0, 0, w, h);
      }
    }
    if (kind === 'fog') {
      ctx.fillStyle = 'rgba(210,210,215,0.35)';
      ctx.fillRect(0, 0, w, h);
    }
  }
}

/** Size in world units targeting `pxSize` on screen, clamped in world metres. */
function px(pxSize: number, zoom: number, minWorld: number, maxWorld: number): number {
  return Math.min(maxWorld, Math.max(minWorld, pxSize / zoom));
}

/** Mix two hex colours; t in 0..1. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}
