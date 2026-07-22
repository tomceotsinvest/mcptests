/**
 * drawPlanet.ts — glowing planets with a soft ring + subtle breathing (§8).
 *
 * Glow is layered translucent circles (wide+dim, mid, crisp core) rather than a
 * blur filter, for performance. Rogue planets get a jagged red ring and a
 * desaturated body. Drawn in WORLD space (call inside the camera transform).
 */
import type { SkCanvas } from '@shopify/react-native-skia';
import { PaintStyle, Skia } from '@shopify/react-native-skia';
import type { Palette } from '@/config/theme';
import type { Planet } from '@/world/entities';
import { withAlpha } from '@/render/color';

const bodyPaint = Skia.Paint();
const glowPaint = Skia.Paint();
const ringPaint = Skia.Paint();
ringPaint.setStyle(PaintStyle.Stroke);
ringPaint.setAntiAlias(true);
bodyPaint.setAntiAlias(true);
glowPaint.setAntiAlias(true);

export function drawPlanet(canvas: SkCanvas, p: Planet, palette: Palette): void {
  const breathe = 1 + 0.03 * Math.sin(p.pulse * 1.6);
  const r = p.r * breathe;

  const hue = p.kind === 'rogue' ? palette.roguePlanet : palette.planetHues[p.hue % 4]!;
  const ringColor = p.kind === 'rogue' ? palette.rogueRing : withAlpha(palette.planetRing, 0.5);

  // wide glow
  glowPaint.setColor(Skia.Color(withAlpha(hue, 0.12)));
  canvas.drawCircle(p.x, p.y, r * 2.1, glowPaint);
  // mid glow
  glowPaint.setColor(Skia.Color(withAlpha(hue, 0.22)));
  canvas.drawCircle(p.x, p.y, r * 1.4, glowPaint);
  // body
  bodyPaint.setColor(Skia.Color(hue));
  canvas.drawCircle(p.x, p.y, r, bodyPaint);
  // inner shade for a touch of depth
  bodyPaint.setColor(Skia.Color(withAlpha('#000000', 0.18)));
  canvas.drawCircle(p.x + r * 0.22, p.y + r * 0.22, r * 0.7, bodyPaint);

  // ring
  if (p.kind === 'rogue') {
    drawJaggedRing(canvas, p.x, p.y, r * 1.5, ringColor);
  } else {
    ringPaint.setColor(Skia.Color(ringColor));
    ringPaint.setStrokeWidth(2);
    canvas.drawCircle(p.x, p.y, r * 1.5, ringPaint);
  }
}

const jag = Skia.Path.Make();
function drawJaggedRing(canvas: SkCanvas, cx: number, cy: number, radius: number, color: string): void {
  jag.reset();
  const spikes = 10;
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? radius : radius * 0.82;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) jag.moveTo(x, y);
    else jag.lineTo(x, y);
  }
  jag.close();
  ringPaint.setColor(Skia.Color(color));
  ringPaint.setStrokeWidth(2.5);
  canvas.drawPath(jag, ringPaint);
}
