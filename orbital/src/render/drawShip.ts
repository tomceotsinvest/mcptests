/**
 * drawShip.ts — the ship: a glowing dart with a white-hot core (§8).
 * Oriented along `heading`. Three skin shapes (dart / wedge / ring). Drawn in
 * WORLD space. A capture-range hint ring is drawn separately by drawFx.
 */
import type { SkCanvas } from '@shopify/react-native-skia';
import { PaintStyle, Skia } from '@shopify/react-native-skia';
import { withAlpha } from '@/render/color';
import type { Ship } from '@/world/entities';

const glow = Skia.Paint();
const hull = Skia.Paint();
const core = Skia.Paint();
const stroke = Skia.Paint();
glow.setAntiAlias(true);
hull.setAntiAlias(true);
core.setAntiAlias(true);
stroke.setAntiAlias(true);
stroke.setStyle(PaintStyle.Stroke);

const body = Skia.Path.Make();

export type ShipShape = 'dart' | 'wedge' | 'ring';

export function drawShip(
  canvas: SkCanvas,
  ship: Ship,
  hullColor: string,
  coreColor: string,
  shape: ShipShape,
  invulnFlash: boolean,
): void {
  canvas.save();
  canvas.translate(ship.x, ship.y);
  canvas.rotate((ship.heading * 180) / Math.PI + 90, 0, 0); // sprite points "up"

  const S = 12; // base size

  // soft glow halo
  glow.setColor(Skia.Color(withAlpha(hullColor, invulnFlash ? 0.5 : 0.28)));
  canvas.drawCircle(0, 0, S * 1.8, glow);

  body.reset();
  if (shape === 'dart') {
    body.moveTo(0, -S * 1.5);
    body.lineTo(S, S);
    body.lineTo(0, S * 0.5);
    body.lineTo(-S, S);
  } else if (shape === 'wedge') {
    body.moveTo(0, -S * 1.4);
    body.lineTo(S * 1.1, S * 0.9);
    body.lineTo(-S * 1.1, S * 0.9);
  } else {
    // ring
    body.addOval(Skia.XYWHRect(-S, -S, S * 2, S * 2));
  }
  body.close();

  hull.setColor(Skia.Color(hullColor));
  canvas.drawPath(body, hull);

  if (shape === 'ring') {
    core.setColor(Skia.Color(withAlpha('#000000', 0.6)));
    canvas.drawCircle(0, 0, S * 0.55, core);
  }

  // white-hot core
  core.setColor(Skia.Color(coreColor));
  canvas.drawCircle(0, -S * 0.2, S * 0.4, core);

  // crisp edge
  stroke.setColor(Skia.Color(withAlpha('#FFFFFF', 0.5)));
  stroke.setStrokeWidth(1.2);
  canvas.drawPath(body, stroke);

  canvas.restore();
}
