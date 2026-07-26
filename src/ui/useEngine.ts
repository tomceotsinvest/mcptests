import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Engine } from '../game/sim/engine';
import type { Difficulty, SaveGame, UISnapshot } from '../game/types';

/**
 * React ↔ engine bridge. The engine updates at frame rate; React re-renders
 * only when the engine bumps its snapshot version (~4 Hz or on commands).
 */
export function useEngine() {
  const engineRef = useRef<Engine | null>(null);
  const [, setStarted] = useState(0);

  const start = useCallback((seed: number, difficulty: Difficulty, save?: SaveGame) => {
    engineRef.current = new Engine(seed, difficulty, save);
    // Debug/testing handle (also used by automated smoke tests).
    (window as unknown as { __engine?: Engine }).__engine = engineRef.current;
    setStarted((x) => x + 1);
  }, []);

  const engine = engineRef.current;

  const subscribe = useCallback(
    (cb: () => void) => (engine ? engine.subscribe(cb) : () => undefined),
    [engine],
  );
  const getSnapshot = useCallback((): UISnapshot | null => (engine ? engine.getSnapshot() : null), [engine]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  return { engine, snapshot, start };
}
