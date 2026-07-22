/**
 * store.ts — zustand store for META + UI state only (§3).
 *
 * Screen routing, currency, unlocks, settings and last-run results live here.
 * The active gameplay runtime does NOT — it's mutable objects in world.ts, so
 * playing never triggers a React re-render. This store updates on transitions
 * (menu <-> game <-> gameover) and persists via save.ts.
 */
import { create } from 'zustand';
import {
  DEFAULT_SAVE,
  flush,
  load,
  reset as resetSave,
  save,
  type Handedness,
  type SaveV1,
} from '@/state/save';

export type Screen = 'boot' | 'menu' | 'game' | 'gameover' | 'shop' | 'settings';

export interface RunResult {
  distance: number;
  stardust: number;
  comboPeak: number;
  newBest: boolean;
  seed: number;
}

interface StoreState {
  screen: Screen;
  booted: boolean;
  save: SaveV1;
  lastResult: RunResult | null;
  showTuning: boolean;

  // lifecycle
  boot: () => Promise<void>;
  go: (screen: Screen) => void;

  // run lifecycle
  commitRun: (r: Omit<RunResult, 'newBest'>) => RunResult;

  // economy
  addStardust: (n: number) => void;
  spendStardust: (n: number) => boolean;
  unlock: (kind: 'ships' | 'trails', id: string) => void;
  equip: (kind: 'ship' | 'trail', id: string) => void;
  spendContinueToken: () => boolean;

  // settings
  setSetting: <K extends keyof SaveV1['settings']>(key: K, value: SaveV1['settings'][K]) => void;
  setHandedness: (h: Handedness) => void;
  resetProgress: () => Promise<void>;
  toggleTuning: () => void;
}

function persist(get: () => StoreState): void {
  save(get().save);
}

export const useStore = create<StoreState>((set, get) => ({
  screen: 'boot',
  booted: false,
  save: { ...DEFAULT_SAVE },
  lastResult: null,
  showTuning: false,

  boot: async () => {
    const loaded = await load();
    set({ save: loaded, booted: true });
  },

  go: (screen) => {
    // persist whenever we leave play or land on a menu-ish screen.
    set({ screen });
    persist(get);
  },

  commitRun: (r) => {
    const s = get().save;
    const newBest = r.distance > s.bestDistance;
    const next: SaveV1 = {
      ...s,
      bestDistance: Math.max(s.bestDistance, r.distance),
      bestCombo: Math.max(s.bestCombo, r.comboPeak),
      totalStardust: s.totalStardust + r.stardust,
      lifetimeStardust: s.lifetimeStardust + r.stardust,
      stats: { ...s.stats, runs: s.stats.runs + 1 },
    };
    const result: RunResult = { ...r, newBest };
    set({ save: next, lastResult: result });
    save(next);
    return result;
  },

  addStardust: (n) => {
    const s = get().save;
    set({
      save: { ...s, totalStardust: s.totalStardust + n, lifetimeStardust: s.lifetimeStardust + n },
    });
    persist(get);
  },

  spendStardust: (n) => {
    const s = get().save;
    if (s.totalStardust < n) return false;
    set({ save: { ...s, totalStardust: s.totalStardust - n } });
    persist(get);
    return true;
  },

  unlock: (kind, id) => {
    const s = get().save;
    if (s.unlocks[kind].includes(id)) return;
    set({ save: { ...s, unlocks: { ...s.unlocks, [kind]: [...s.unlocks[kind], id] } } });
    persist(get);
  },

  equip: (kind, id) => {
    const s = get().save;
    set({ save: { ...s, equipped: { ...s.equipped, [kind]: id } } });
    persist(get);
  },

  spendContinueToken: () => {
    const s = get().save;
    if (s.continueTokens <= 0) return false;
    set({ save: { ...s, continueTokens: s.continueTokens - 1 } });
    persist(get);
    return true;
  },

  setSetting: (key, value) => {
    const s = get().save;
    set({ save: { ...s, settings: { ...s.settings, [key]: value } } });
    persist(get);
  },

  setHandedness: (h) => {
    const s = get().save;
    set({ save: { ...s, settings: { ...s.settings, handedness: h } } });
    persist(get);
  },

  resetProgress: async () => {
    await resetSave();
    set({ save: { ...DEFAULT_SAVE } });
    await flush();
  },

  toggleTuning: () => set((st) => ({ showTuning: !st.showTuning })),
}));
