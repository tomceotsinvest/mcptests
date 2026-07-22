/**
 * drawTrail.ts — tapering, fading, additive ribbon of the last ~40 ship
 * positions (§8). Width tapers from head to tail; color lerps cyan->magenta
 * (or the equipped trail skin). Drawn in WORLD space.
 *
 * Implementation: build a polygon from left/right offsets around each trail
 * point (perpendicular to the local direction), fill with an additive paint.
 * One path, one draw call.
 */
import type { SkCanvas } from '@shopify/react-native-skia';
import { BlendMode, Skia } from '@shopify/react-native-skia';
import { SIM } from '@/config/tuning';
import { mixHex, withAlpha } from '@/render/color';

const ribbon = Skia.Path.Make();
const paint = Skia.Paint();
paint.setAntiAlias(true);
paint.setBlendMode(BlendMode.Plus); // additive glow

const HEAD_W = 7;
const TAIL_W = 0.5;

// preallocated edge buffers (no per-frame allocation, §7)
const lx = new Float32Array(SIM.TRAIL_LENGTH);
const ly = new Float32Array(SIM.TRAIL_LENGTH);
const rx = new Float32Array(SIM.TRAIL_LENGTH);
const ry = new Float32Array(SIM.TRAIL_LENGTH);

export function drawTrail(
  canvas: SkCanvas,
  trailX: Float32Array,
  trailY: Float32Array,
  head: number,
  count: number,
  len: number,
  colorA: string,
  colorB: string,
): void {
  if (count < 3) return;

  // walk from oldest -> newest into an ordered array of indices
  ribbon.reset();
  // build left edge forward, right edge backward
  const n = count;
  // oldest index in the ring
  const start = (head - count + len * 2) % len;

  let prevX = 0;
  let prevY = 0;

  for (let i = 0; i < n; i++) {
    const idx = (start + i) % len;
    const x = trailX[idx]!;
    const y = trailY[idx]!;
    // direction from previous sample
    let dx = i === 0 ? 0 : x - prevX;
    let dy = i === 0 ? 0 : y - prevY;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    // perpendicular
    const t = i / (n - 1); // 0 tail -> 1 head
    const wHalf = (TAIL_W + (HEAD_W - TAIL_W) * t) / 2;
    const nx = -dy * wHalf;
    const ny = dx * wHalf;
    lx[i] = x + nx;
    ly[i] = y + ny;
    rx[i] = x - nx;
    ry[i] = y - ny;
    prevX = x;
    prevY = y;
  }

  ribbon.moveTo(lx[0]!, ly[0]!);
  for (let i = 1; i < n; i++) ribbon.lineTo(lx[i]!, ly[i]!);
  for (let i = n - 1; i >= 0; i--) ribbon.lineTo(rx[i]!, ry[i]!);
  ribbon.close();

  // color: a single mid-tone with head-biased alpha reads as a glowing streak.
  paint.setColor(Skia.Color(withAlpha(mixHex(colorA, colorB, 0.5), 0.55)));
  canvas.drawPath(ribbon, paint);

  // brighter crisp core near the head
  const coreStart = Math.floor(n * 0.55);
  ribbon.reset();
  ribbon.moveTo(lx[coreStart]!, ly[coreStart]!);
  for (let i = coreStart + 1; i < n; i++) ribbon.lineTo(lx[i]!, ly[i]!);
  for (let i = n - 1; i >= coreStart; i--) ribbon.lineTo(rx[i]!, ry[i]!);
  ribbon.close();
  paint.setColor(Skia.Color(withAlpha(colorA, 0.7)));
  canvas.drawPath(ribbon, paint);
}
