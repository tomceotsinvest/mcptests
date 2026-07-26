import type { SaveGame } from '../types';
import { SAVE_KEY, SAVE_VERSION } from '../constants';

/**
 * Persistence. The static map regenerates from the seed, so a save is just
 * player infrastructure + dynamic state. Agents are transient by design.
 */

export function saveToLocal(save: SaveGame): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function loadFromLocal(): SaveGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveGame;
    if (parsed.version !== SAVE_VERSION) return null; // future: migrations
    return parsed;
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Download the save as a JSON file. */
export function exportSave(save: SaveGame): void {
  const blob = new Blob([JSON.stringify(save, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `london-transport-day${Math.floor(save.minute / 1440) + 1}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSave(file: File): Promise<SaveGame | null> {
  return file.text().then((raw) => {
    try {
      const parsed = JSON.parse(raw) as SaveGame;
      return parsed.version === SAVE_VERSION ? parsed : null;
    } catch {
      return null;
    }
  });
}
