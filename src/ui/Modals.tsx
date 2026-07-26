import { useRef, useState } from 'react';
import type { Difficulty, SaveGame } from '../game/types';
import { DIFFICULTIES } from '../game/constants';
import { fmtMoney } from '../game/util';
import { importSave, loadFromLocal } from '../game/sim/saveload';

export function NewGameModal({
  hasSave,
  onStart,
}: {
  hasSave: boolean;
  onStart: (difficulty: Difficulty, seed: number, save?: SaveGame) => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h2>
          <span className="roundel" /> London Transport Commissioner
        </h2>
        <p className="dim">
          Design and run the most efficient public transport network Zone 1 has ever seen. Every passenger is
          simulated; every decision shows up in the numbers.
        </p>
        <h4>Difficulty</h4>
        <div className="diff-grid">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
            const def = DIFFICULTIES[d];
            return (
              <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>
                <b>{def.label}</b>
                <small>{def.sandbox ? 'Unlimited funds' : `Start ${fmtMoney(def.startCash)}`}</small>
                <small className="dim">
                  {d === 'easy' && 'Forgiving costs, patient passengers'}
                  {d === 'normal' && 'The standard commission'}
                  {d === 'hard' && 'Tight budgets, more incidents'}
                  {d === 'realistic' && 'Strict budgets, demanding passengers'}
                  {d === 'sandbox' && 'Build without limits'}
                </small>
              </button>
            );
          })}
        </div>
        <div className="btn-row">
          <label className="dim seed-label">
            Map seed{' '}
            <input value={seed} onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, '')) || 0)} />
          </label>
        </div>
        <div className="btn-row">
          <button className="primary" onClick={() => onStart(difficulty, seed)}>
            Take office
          </button>
          {hasSave && (
            <button
              onClick={() => {
                const save = loadFromLocal();
                if (save) onStart(save.difficulty, save.seed, save);
              }}
            >
              Continue saved game
            </button>
          )}
          <button onClick={() => fileRef.current?.click()}>Import save…</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const save = await importSave(file);
              if (save) onStart(save.difficulty, save.seed, save);
            }}
          />
        </div>
      </div>
    </div>
  );
}
