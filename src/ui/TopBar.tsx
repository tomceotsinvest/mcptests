import type { Engine } from '../game/sim/engine';
import type { UISnapshot } from '../game/types';
import { WEATHER_LABEL } from '../game/sim/weather';
import { fmtInt, fmtMoney } from '../game/util';
import type { PanelKind } from './SidePanels';
import { exportSave, saveToLocal } from '../game/sim/saveload';

const SPEED_LABELS = ['⏸', '▶', '▶▶', '▶▶▶'];

export function TopBar({
  engine,
  snap,
  panel,
  setPanel,
}: {
  engine: Engine;
  snap: UISnapshot;
  panel: PanelKind;
  setPanel: (p: PanelKind) => void;
}) {
  const cash = snap.cash === Infinity ? '∞ (sandbox)' : fmtMoney(snap.cash);
  const toggle = (p: PanelKind) => setPanel(panel === p ? 'inspector' : p);
  return (
    <div className="topbar">
      <div className="brand">
        <span className="roundel" />
        <b>London Transport Commissioner</b>
      </div>
      <div className="clock">
        <b>{snap.timeLabel}</b>
        <span>{snap.dateLabel}</span>
      </div>
      <div className="speeds">
        {SPEED_LABELS.map((s, i) => (
          <button key={s} className={snap.speed === i ? 'active' : ''} onClick={() => engine.setSpeed(i)}>
            {s}
          </button>
        ))}
      </div>
      <div className="stat" title="Treasury">
        💷 <b className={snap.cash < 0 ? 'bad' : ''}>{cash}</b>
      </div>
      <div className="stat" title="Passengers today">
        👥 <b>{fmtInt(snap.passengersToday)}</b>
      </div>
      <div className="stat" title="Passenger happiness / rating">
        😊 <b>{snap.happiness.toFixed(0)}%</b> <span className="dim">{snap.rating}</span>
      </div>
      <div className="stat" title="City congestion">
        🚗 <b>{(snap.congestion * 100).toFixed(0)}%</b>
      </div>
      <div className="stat" title="Weather">
        {WEATHER_LABEL[snap.weather]} {snap.temp}°C
      </div>
      <div className="grow" />
      <button className={panel === 'finance' ? 'tab active' : 'tab'} onClick={() => toggle('finance')}>
        Finance
      </button>
      <button className={panel === 'stats' ? 'tab active' : 'tab'} onClick={() => toggle('stats')}>
        Statistics
      </button>
      <button className={panel === 'achievements' ? 'tab active' : 'tab'} onClick={() => toggle('achievements')}>
        Awards
      </button>
      <button className={panel === 'help' ? 'tab active' : 'tab'} onClick={() => toggle('help')}>
        Help
      </button>
      <button
        className="tab"
        onClick={() => {
          saveToLocal(engine.toSave());
        }}
        title="Save to browser storage"
      >
        Save
      </button>
      <button className="tab" onClick={() => exportSave(engine.toSave())} title="Download save file">
        Export
      </button>
    </div>
  );
}
