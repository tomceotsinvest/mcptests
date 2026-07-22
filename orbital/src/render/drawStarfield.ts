/**
 * drawStarfield.ts — 3 parallax layers of stars (§8).
 *
 * Stars are generated once into screen-space tiles and scrolled by the camera
 * with per-layer parallax factors, wrapping vertically. No per-frame allocation.
 */
import type { SkCanvas, SkPaint } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import type { Palette } from '@/config/theme';
import { RNG } from '@/engine/rng';

interface Star {
  x: number;
  y: number;
  r: number;
  layer: 0 | 1 | 2;
  tw: number; // twinkle phase
}

export interface Starfield {
  stars: Star[];
  w: number;
  h: number;
  paints: [SkPaint, SkPaint, SkPaint];
}

const PARALLAX = [0.15, 0.35, 0.62]; // dim/far -> bright/near

export function makeStarfield(w: number, h: number, palette: Palette): Starfield {
  const rng = new RNG(0xace1);
  const stars: Star[] = [];
  const counts = [70, 46, 26];
  for (let layer = 0 as 0 | 1 | 2; layer < 3; layer = (layer + 1) as 0 | 1 | 2) {
    for (let i = 0; i < counts[layer]!; i++) {
      stars.push({
        x: rng.range(0, w),
        y: rng.range(0, h),
        r: layer === 0 ? rng.range(0.6, 1.2) : layer === 1 ? rng.range(1.0, 1.8) : rng.range(1.4, 2.4),
        layer,
        tw: rng.range(0, Math.PI * 2),
      });
    }
  }
  const mk = (c: string) => {
    const p = Skia.Paint();
    p.setColor(Skia.Color(c));
    p.setAntiAlias(true);
    return p;
  };
  return {
    stars,
    w,
    h,
    paints: [mk(palette.star[0]), mk(palette.star[1]), mk(palette.star[2])],
  };
}

/**
 * Draw the starfield in SCREEN space (call before the camera transform).
 * `camY` scrolls the field; `time` drives a subtle twinkle.
 */
export function drawStarfield(
  canvas: SkCanvas,
  sf: Starfield,
  camX: number,
  camY: number,
  time: number,
): void {
  const { w, h } = sf;
  for (let i = 0; i < sf.stars.length; i++) {
    const s = sf.stars[i]!;
    const px = PARALLAX[s.layer]!;
    // wrap into [0,w) / [0,h)
    let x = (s.x - camX * px) % w;
    if (x < 0) x += w;
    let y = (s.y - camY * px) % h;
    if (y < 0) y += h;
    const twinkle = 0.75 + 0.25 * Math.sin(time * 2 + s.tw);
    const paint = sf.paints[s.layer]!;
    paint.setAlphaf(twinkle);
    canvas.drawCircle(x, y, s.r, paint);
  }
}
