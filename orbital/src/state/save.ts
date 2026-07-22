/**
 * save.ts — typed AsyncStorage wrapper with schema versioning + migration (§13).
 *
 * Writes are debounced and only happen at safe moments (game-over / menu
 * transitions), never during the active sim loop. `migrate()` upgrades older
 * schemas; today it's a v1 identity stub, but the shape is here so future
 * versions add a case without touching call sites.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'orbital.save.v1';

export type Handedness = 'L' | 'R';

export interface SaveV1 {
  version: 1;
  bestDistance: number;
  bestCombo: number;
  totalStardust: number; // spendable balance
  lifetimeStardust: number; // for stats
  unlocks: { ships: string[]; trails: string[] };
  equipped: { ship: string; trail: string };
  continueTokens: number;
  settings: {
    music: number;
    sfx: number;
    haptics: boolean;
    colorblind: boolean;
    handedness: Handedness;
  };
  stats: { runs: number; deathsByHazard: Record<string, number> };
  flags: { seenTutorial: boolean };
}

export const DEFAULT_SAVE: SaveV1 = {
  version: 1,
  bestDistance: 0,
  bestCombo: 0,
  totalStardust: 0,
  lifetimeStardust: 0,
  unlocks: { ships: ['default'], trails: ['default'] },
  equipped: { ship: 'default', trail: 'default' },
  continueTokens: 0,
  settings: {
    music: 0.7,
    sfx: 0.9,
    haptics: true,
    colorblind: false,
    handedness: 'R',
  },
  stats: { runs: 0, deathsByHazard: {} },
  flags: { seenTutorial: false },
};

/** Upgrade any older persisted blob to the current schema. */
export function migrate(raw: unknown): SaveV1 {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SAVE };
  const anyRaw = raw as { version?: number };
  // future: switch on anyRaw.version and transform forward, step by step.
  switch (anyRaw.version) {
    case 1:
      // merge onto defaults so a newly-added field is never undefined.
      return deepMerge(DEFAULT_SAVE, raw as Partial<SaveV1>);
    default:
      return { ...DEFAULT_SAVE };
  }
}

export async function load(): Promise<SaveV1> {
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (!s) return { ...DEFAULT_SAVE };
    return migrate(JSON.parse(s));
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pending: SaveV1 | null = null;

/** Debounced persist. Safe to call on transitions; coalesces rapid writes. */
export function save(data: SaveV1): void {
  pending = data;
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 400);
}

export async function flush(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!pending) return;
  const data = pending;
  pending = null;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // best-effort; a failed write just means we retry next transition.
  }
}

export async function reset(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// shallow-ish deep merge for one level of nested objects (enough for the schema)
function deepMerge(base: SaveV1, over: Partial<SaveV1>): SaveV1 {
  const out: SaveV1 = { ...base, ...over } as SaveV1;
  out.unlocks = { ...base.unlocks, ...(over.unlocks ?? {}) };
  out.equipped = { ...base.equipped, ...(over.equipped ?? {}) };
  out.settings = { ...base.settings, ...(over.settings ?? {}) };
  out.stats = { ...base.stats, ...(over.stats ?? {}) };
  out.flags = { ...base.flags, ...(over.flags ?? {}) };
  return out;
}
