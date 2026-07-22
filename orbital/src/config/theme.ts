/**
 * theme.ts — palettes and skin definitions (§8).
 *
 * Clean neon-minimal deep space. Everything is procedural shapes + glow, so
 * colors live here and drawing code stays dumb. Includes a colorblind-friendly
 * alternate and a couple of shop skin palettes.
 */

export type Palette = {
  bgTop: string;
  bgBottom: string;
  star: [string, string, string]; // 3 parallax layers dim -> bright
  ship: string;
  shipCore: string;
  trailA: string; // ribbon gradient start
  trailB: string; // ribbon gradient end
  planetHues: [string, string, string, string];
  planetRing: string;
  roguePlanet: string;
  rogueRing: string;
  dust: string;
  danger: string;
  perfect: string;
  hudText: string;
  hudDim: string;
};

export const DEFAULT_PALETTE: Palette = {
  bgTop: '#0B1022',
  bgBottom: '#05060B',
  star: ['#2A3350', '#5C6B9A', '#AEB9E8'],
  ship: '#5EE7FF',
  shipCore: '#FFFFFF',
  trailA: '#5EE7FF',
  trailB: '#FF63C1',
  planetHues: ['#FF7597', '#FFD166', '#7CE0A6', '#B08CFF'],
  planetRing: '#FFFFFF',
  roguePlanet: '#8A93B0',
  rogueRing: '#FF5566',
  dust: '#FFDD88',
  danger: '#FF6B4A',
  perfect: '#B9FFE3',
  hudText: '#EAF0FF',
  hudDim: '#7C88B0',
};

// Colorblind-friendly (deuteranopia/protanopia safe): swap red/green cues for
// blue/orange/yellow with distinct luminance so hazards read by brightness too.
export const COLORBLIND_PALETTE: Palette = {
  ...DEFAULT_PALETTE,
  planetHues: ['#4FC3F7', '#FFD166', '#FFFFFF', '#B08CFF'],
  roguePlanet: '#9AA3C0',
  rogueRing: '#FFB000', // amber, not red
  danger: '#FF9E00', // orange, high luminance
  dust: '#FFE066',
  trailB: '#FFB000',
};

// Shop skin trail palettes (cosmetic only). Keyed by trail id.
export const TRAIL_SKINS: Record<string, { a: string; b: string; label: string; price: number }> = {
  default: { a: '#5EE7FF', b: '#FF63C1', label: 'Aurora', price: 0 },
  ember: { a: '#FFD166', b: '#FF5C4D', label: 'Ember', price: 40 },
  mint: { a: '#7CE0A6', b: '#5EE7FF', label: 'Mint', price: 60 },
  violet: { a: '#B08CFF', b: '#5EE7FF', label: 'Nebula', price: 80 },
  supporter: { a: '#FFFFFF', b: '#FFD166', label: 'Supernova', price: 0 }, // IAP-gated
};

// Shop ship skins (color of hull + shape variant id).
export const SHIP_SKINS: Record<
  string,
  { hull: string; core: string; shape: 'dart' | 'wedge' | 'ring'; label: string; price: number }
> = {
  default: { hull: '#5EE7FF', core: '#FFFFFF', shape: 'dart', label: 'Scout', price: 0 },
  wedge: { hull: '#FF7597', core: '#FFFFFF', shape: 'wedge', label: 'Falcon', price: 50 },
  ring: { hull: '#7CE0A6', core: '#FFFFFF', shape: 'ring', label: 'Halo', price: 90 },
};

export function paletteFor(colorblind: boolean): Palette {
  return colorblind ? COLORBLIND_PALETTE : DEFAULT_PALETTE;
}
