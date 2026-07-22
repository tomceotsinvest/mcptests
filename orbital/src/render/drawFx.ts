/**
 * drawFx.ts — dust, grip-miss flash, and dev-debug overlays (§4, §11).
 * Particles (capture/release bursts, death) arrive in M3 via particles.ts; this
 * file holds the always-on world FX plus optional debug visualisations.
 */
import type { SkCanvas } from '@shopify/react-native-skia';
import { PaintStyle, Skia } from '@shopify/react-native-skia';
import { T } from '@/config/tuning';
import type { Palette } from '@/config/theme';
import { withAlpha } from '@/render/color';
import type { Dust, Planet, Ship } from '@/world/entities';
import { Pool } from '@/engine/pool';

const dustPaint = Skia.Paint();
dustPaint.setAntiAlias(true);
const debugPaint = Skia.Paint();
debugPaint.setAntiAlias(true);
debugPaint.setStyle(PaintStyle.Stroke);
debugPaint.setStrokeWidth(1);

export function drawDust(canvas: SkCanvas, dust: Pool<Dust>, palette: Palette, time: number): void {
  for (let i = 0; i < dust.activeCount; i++) {
    const d = dust.get(i);
    if (d.collected) continue;
    const tw = 0.6 + 0.4 * Math.sin(time * 4 + d.twinkle);
    dustPaint.setColor(Skia.Color(withAlpha(palette.dust, 0.18 * tw)));
    canvas.drawCircle(d.x, d.y, 7, dustPaint);
    dustPaint.setColor(Skia.Color(withAlpha(palette.dust, tw)));
    canvas.drawCircle(d.x, d.y, 2.6, dustPaint);
  }
}

/** Screen-space red vignette flash when a grip misses (0..1 strength). */
export function drawGripFlash(canvas: SkCanvas, w: number, h: number, strength: number, palette: Palette): void {
  if (strength <= 0) return;
  dustPaint.setColor(Skia.Color(withAlpha(palette.danger, 0.16 * strength)));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), dustPaint);
}

// ---- debug overlays (dev tuning panel) ----
export function drawCaptureRadii(canvas: SkCanvas, planets: Pool<Planet>): void {
  debugPaint.setColor(Skia.Color(withAlpha('#5EE7FF', 0.4)));
  for (let i = 0; i < planets.activeCount; i++) {
    const p = planets.get(i);
    if (p.kind === 'rogue') continue;
    canvas.drawCircle(p.x, p.y, p.r + T.CAPTURE_RADIUS, debugPaint);
  }
}

export function drawOrbitPath(canvas: SkCanvas, ship: Ship): void {
  if (ship.mode !== 'orbit' || !ship.planet) return;
  debugPaint.setColor(Skia.Color(withAlpha('#FFD166', 0.6)));
  canvas.drawCircle(ship.planet.x, ship.planet.y, ship.radius, debugPaint);
}
