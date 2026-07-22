/**
 * color.ts — tiny hex helpers for building translucent glow colors.
 * Skia.Color accepts CSS rgba() strings, so we emit those.
 */
const cache = new Map<string, [number, number, number]>();

function hexToRgb(hex: string): [number, number, number] {
  const cached = cache.get(hex);
  if (cached) return cached;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const rgb: [number, number, number] = [r, g, b];
  cache.set(hex, rgb);
  return rgb;
}

/** Return an rgba() string for a hex color at alpha `a` (0..1). */
export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Linear blend between two hex colors, returning an rgb() string. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
