import type { WeatherKind, WeatherState } from '../types';
import { MIN_PER_DAY } from '../constants';

export interface WeatherEffects {
  /** road speed multiplier */
  road: number;
  /** walking speed multiplier */
  walk: number;
  /** overall trip demand multiplier */
  demand: number;
  /** share of would-be walkers pushed onto transit */
  transitShift: number;
  /** vehicle breakdown likelihood multiplier */
  reliability: number;
}

export const WEATHER_EFFECTS: Record<WeatherKind, WeatherEffects> = {
  clear: { road: 1, walk: 1, demand: 1, transitShift: 0, reliability: 1 },
  cloud: { road: 1, walk: 1, demand: 1, transitShift: 0, reliability: 1 },
  rain: { road: 0.92, walk: 0.9, demand: 0.97, transitShift: 0.15, reliability: 1.1 },
  heavyRain: { road: 0.8, walk: 0.75, demand: 0.9, transitShift: 0.3, reliability: 1.3 },
  storm: { road: 0.7, walk: 0.6, demand: 0.8, transitShift: 0.35, reliability: 1.8 },
  fog: { road: 0.82, walk: 0.95, demand: 0.95, transitShift: 0.1, reliability: 1.2 },
  wind: { road: 0.93, walk: 0.85, demand: 0.96, transitShift: 0.1, reliability: 1.2 },
  snow: { road: 0.6, walk: 0.6, demand: 0.8, transitShift: 0.25, reliability: 1.6 },
  heat: { road: 0.95, walk: 0.85, demand: 0.95, transitShift: 0.2, reliability: 1.3 },
};

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: '☀️ Clear',
  cloud: '⛅ Cloudy',
  rain: '🌧️ Rain',
  heavyRain: '⛈️ Heavy rain',
  storm: '🌩️ Storm',
  fog: '🌫️ Fog',
  wind: '💨 High winds',
  snow: '❄️ Snow',
  heat: '🥵 Heatwave',
};

/** Season index 0..3 (winter, spring, summer, autumn) from day-of-year. */
export function seasonOf(day: number): number {
  const doy = day % 365;
  if (doy < 59 || doy >= 334) return 0;
  if (doy < 151) return 1;
  if (doy < 243) return 2;
  return 3;
}

/** Transition weights per season; a simple Markov chain, sampled every 2–4 h. */
const SEASON_WEIGHTS: Record<number, [WeatherKind, number][]> = {
  0: [['clear', 2], ['cloud', 4], ['rain', 3], ['heavyRain', 1], ['fog', 1.5], ['wind', 1.5], ['snow', 1.2], ['storm', 0.4]],
  1: [['clear', 4], ['cloud', 4], ['rain', 2.5], ['heavyRain', 0.8], ['fog', 0.5], ['wind', 1], ['storm', 0.5]],
  2: [['clear', 6], ['cloud', 3], ['rain', 1.5], ['heavyRain', 0.8], ['heat', 1.2], ['storm', 0.8], ['wind', 0.5]],
  3: [['clear', 3], ['cloud', 4], ['rain', 3], ['heavyRain', 1], ['fog', 1.2], ['wind', 1.5], ['storm', 0.5]],
};

const SEASON_TEMP = [5, 12, 24, 13];

export function nextWeather(minute: number, day: number, rng: () => number): WeatherState {
  const season = seasonOf(day);
  const table = SEASON_WEIGHTS[season];
  let total = 0;
  for (const [, w] of table) total += w;
  let r = rng() * total;
  let kind: WeatherKind = 'cloud';
  for (const [k, w] of table) {
    r -= w;
    if (r <= 0) {
      kind = k;
      break;
    }
  }
  const duration = 120 + rng() * 160; // 2–4.7 h
  const temp = SEASON_TEMP[season] + (rng() - 0.5) * 8 + (kind === 'heat' ? 10 : 0) + (kind === 'snow' ? -6 : 0);
  return { kind, until: minute + duration, temp: Math.round(temp) };
}

/** Daylight factor 0 (night) .. 1 (day), season-aware. */
export function daylight(minute: number, day: number): number {
  const t = (minute % MIN_PER_DAY) / 60; // hours
  const season = seasonOf(day);
  const rise = [7.9, 6.2, 4.9, 6.8][season];
  const set = [16.2, 19.9, 21.3, 18.5][season];
  const ramp = 1.0; // hour-long dawn/dusk
  if (t < rise - ramp || t > set + ramp) return 0;
  if (t < rise) return (t - (rise - ramp)) / ramp;
  if (t > set) return 1 - (t - set) / ramp;
  return 1;
}
