import { useRef, useEffect } from 'react';
import type { Engine } from '../game/sim/engine';
import type { DayStats, Mode, UISnapshot } from '../game/types';
import { COSTS, VEHICLE_TYPES, vehicleType } from '../game/constants';
import { fmtInt, fmtMoney } from '../game/util';
import { ACHIEVEMENTS } from '../game/sim/achievements';

export type PanelKind = 'inspector' | 'finance' | 'stats' | 'achievements' | 'help';

export function SidePanel({
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
  return (
    <div className="sidepanel">
      {panel === 'inspector' && <Inspector engine={engine} snap={snap} />}
      {panel === 'finance' && <Finance engine={engine} snap={snap} />}
      {panel === 'stats' && <Stats snap={snap} />}
      {panel === 'achievements' && <Achievements snap={snap} />}
      {panel === 'help' && <Help />}
    </div>
  );
}

/* ------------------------------------------------------------ inspector */

function Inspector({ engine, snap }: { engine: Engine; snap: UISnapshot }) {
  if (snap.draft) return <DraftEditor engine={engine} snap={snap} />;
  if (snap.selectedStop >= 0 && engine.net.stops[snap.selectedStop]) {
    return <StopInspector engine={engine} snap={snap} />;
  }
  if (snap.selectedRoute >= 0 && engine.net.routes[snap.selectedRoute]) {
    return <RouteInspector engine={engine} snap={snap} />;
  }
  return (
    <div className="panel-body">
      <h3>Network overview</h3>
      <p className="dim">
        {snap.routeCount} routes · {snap.vehicleCount} vehicles · {fmtInt(snap.activeAgents)} passengers
        travelling now
      </p>
      <p>Select a route or stop on the map, or pick a build tool on the left to start designing services.</p>
      <h4>Routes</h4>
      <div className="route-list">
        {engine.net.routes.filter(Boolean).map((r) => (
          <button
            key={r!.id}
            className="route-row"
            onClick={() => {
              engine.selectedRoute = r!.id;
              engine.selectedStop = -1;
              engine.setTool('select');
            }}
          >
            <span className="swatch" style={{ background: r!.color }} />
            <span className="grow">{r!.name}</span>
            <span className="dim">{fmtInt(r!.boardingsYesterday)}/day</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DraftEditor({ engine, snap }: { engine: Engine; snap: UISnapshot }) {
  const d = snap.draft!;
  const modeName = { bus: 'Bus route', tram: 'Tram line', tube: 'Underground line', boat: 'River bus' }[d.mode];
  return (
    <div className="panel-body">
      <h3>New {modeName}</h3>
      <p className="dim">{d.message}</p>
      <p>
        Stops: <b>{d.stops.length}</b>
      </p>
      <p>
        Construction cost: <b>{fmtMoney(d.cost)}</b>
      </p>
      {d.mode === 'tube' && <p className="dim">Tunnelling is expensive — reuse existing stations for interchanges.</p>}
      {d.mode === 'boat' && <p className="dim">Click piers along the Thames (highlighted blue).</p>}
      <p className="dim">Tip: right-click or Backspace removes the last stop. Click your first stop again last to make a circular route.</p>
      <div className="btn-row">
        <button className="primary" disabled={!d.valid} onClick={() => engine.commitDraft()}>
          Build ({fmtMoney(d.cost)})
        </button>
        <button
          onClick={() => {
            engine.cancelDraft();
            engine.setTool('select');
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RouteInspector({ engine, snap }: { engine: Engine; snap: UISnapshot }) {
  const r = engine.net.routes[snap.selectedRoute]!;
  const vt = vehicleType(r.vehicleType);
  let fleet = 0;
  for (const v of engine.net.vehicles.values()) if (v.routeId === r.id) fleet++;
  const headway = engine.net.headwayMinutes(r);
  const types = VEHICLE_TYPES.filter((t) => t.mode === r.mode);
  return (
    <div className="panel-body">
      <h3>
        <span className="swatch" style={{ background: r.color }} /> {r.name}
        {r.legacy && <span className="badge">inherited</span>}
      </h3>
      <p className="dim">
        {r.mode.toUpperCase()} · {r.stops.length} stops · {(engine.net.routeLength(r) / 1000).toFixed(1)} km
        {r.circular ? ' · circular' : ''}
      </p>
      <table className="kv">
        <tbody>
          <tr>
            <td>Vehicles</td>
            <td>
              <button onClick={() => engine.setVehicles(r.id, r.vehiclesTarget - 1)}>−</button>
              <b> {fleet} </b>
              <button onClick={() => engine.setVehicles(r.id, r.vehiclesTarget + 1)}>+</button>
            </td>
          </tr>
          <tr>
            <td>Headway</td>
            <td>{isFinite(headway) ? `${headway.toFixed(1)} min` : 'no service'}</td>
          </tr>
          <tr>
            <td>Boardings yesterday</td>
            <td>{fmtInt(r.boardingsYesterday)}</td>
          </tr>
          <tr>
            <td>Boardings today</td>
            <td>{fmtInt(r.boardingsToday)}</td>
          </tr>
          <tr>
            <td>Crowding</td>
            <td>{(r.crowding * 100).toFixed(0)}%</td>
          </tr>
          <tr>
            <td>Status</td>
            <td>
              {r.slowUntil > snap.minute ? '⚠️ disrupted' : r.active ? 'running' : 'suspended'}{' '}
              <button onClick={() => engine.toggleRouteActive(r.id)}>{r.active ? 'Suspend' : 'Resume'}</button>
            </td>
          </tr>
        </tbody>
      </table>
      {!r.legacy && (
        <>
          <h4>Vehicle type — {vt.name}</h4>
          <div className="type-list">
            {types.map((t) => (
              <button
                key={t.id}
                className={t.id === r.vehicleType ? 'active' : ''}
                title={`${t.name}: ${t.capacity} pax, ${fmtMoney(t.price)}`}
                onClick={() => engine.setVehicleType(r.id, t.id)}
              >
                {t.name}
                <small>
                  {t.capacity} pax · {fmtMoney(t.price)}
                </small>
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button className="danger" onClick={() => engine.deleteRoute(r.id)}>
              Withdraw route
            </button>
          </div>
        </>
      )}
      {r.legacy && <p className="dim">Inherited Underground lines can be re-equipped and re-timetabled, not demolished.</p>}
    </div>
  );
}

function StopInspector({ engine, snap }: { engine: Engine; snap: UISnapshot }) {
  const s = engine.net.stops[snap.selectedStop]!;
  const waiting = engine.agents.waiting.get(s.id)?.length ?? 0;
  return (
    <div className="panel-body">
      <h3>{s.name}</h3>
      <p className="dim">
        {s.mode === 'tube' ? 'Station' : s.mode === 'boat' ? 'Pier' : 'Stop'} #{s.id}
        {s.closedUntil > snap.minute && <span className="badge bad">CLOSED</span>}
      </p>
      <p>
        Waiting now: <b>{waiting}</b>
      </p>
      <h4>Served by</h4>
      <div className="route-list">
        {s.routes.map((rid) => {
          const r = engine.net.routes[rid];
          if (!r) return null;
          return (
            <button
              key={rid}
              className="route-row"
              onClick={() => {
                engine.selectedRoute = rid;
                engine.selectedStop = -1;
                engine.setTool('select');
              }}
            >
              <span className="swatch" style={{ background: r.color }} />
              <span className="grow">{r.name}</span>
            </button>
          );
        })}
        {s.routes.length === 0 && <p className="dim">No services.</p>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- finance */

function Finance({ engine, snap }: { engine: Engine; snap: UISnapshot }) {
  const last: DayStats | undefined = snap.history[snap.history.length - 1];
  const fares = snap.fares;
  const fareRow = (mode: Mode, label: string) => (
    <tr key={mode}>
      <td>{label}</td>
      <td>
        <button onClick={() => engine.setFare(mode, fares[mode] - 0.25)}>−</button>
        <b> £{fares[mode].toFixed(2)} </b>
        <button onClick={() => engine.setFare(mode, fares[mode] + 0.25)}>+</button>
      </td>
    </tr>
  );
  return (
    <div className="panel-body">
      <h3>Finance</h3>
      <table className="kv">
        <tbody>
          <tr>
            <td>Cash</td>
            <td className={snap.cash < 0 ? 'bad' : ''}>{snap.cash === Infinity ? '∞' : fmtMoney(snap.cash)}</td>
          </tr>
          <tr>
            <td>Loans outstanding</td>
            <td>{fmtMoney(snap.loan)}</td>
          </tr>
          {last && (
            <>
              <tr>
                <td>Yesterday revenue</td>
                <td>{fmtMoney(last.revenue)}</td>
              </tr>
              <tr>
                <td>Yesterday costs</td>
                <td>{fmtMoney(last.costs)}</td>
              </tr>
              <tr>
                <td>Yesterday profit</td>
                <td className={last.profit < 0 ? 'bad' : 'good'}>{fmtMoney(last.profit)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <h4>Loans (max {fmtMoney(COSTS.loanMax)})</h4>
      <div className="btn-row">
        <button onClick={() => engine.takeLoan(100_000_000)}>Borrow £100m</button>
        <button onClick={() => engine.repayLoan(100_000_000)}>Repay £100m</button>
      </div>
      <h4>Fares</h4>
      <table className="kv">
        <tbody>
          {fareRow('bus', '🚌 Bus')}
          {fareRow('tram', '🚋 Tram')}
          {fareRow('tube', '🚇 Underground')}
          {fareRow('boat', '⛴️ River bus')}
        </tbody>
      </table>
      <h4>Policies</h4>
      <label className="check">
        <input
          type="checkbox"
          checked={snap.policies.congestionCharge}
          onChange={(e) => engine.setPolicy('congestionCharge', e.target.checked)}
        />
        Congestion charge (revenue, less traffic)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={snap.policies.advertising}
          onChange={(e) => engine.setPolicy('advertising', e.target.checked)}
        />
        Advertising on vehicles
      </label>
      <label className="check">
        Bike share level
        <select
          value={snap.policies.bikeShare}
          onChange={(e) => engine.setBikeShare(Number(e.target.value) as 0 | 1 | 2 | 3)}
        >
          {[0, 1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="dim">(£20m per level)</span>
      </label>
    </div>
  );
}

/* ---------------------------------------------------------------- stats */

function Stats({ snap }: { snap: UISnapshot }) {
  const hist = snap.history;
  const last = hist[hist.length - 1];
  return (
    <div className="panel-body">
      <h3>Statistics</h3>
      {!last && <p className="dim">First daily report arrives at 03:00.</p>}
      {last && (
        <table className="kv">
          <tbody>
            <tr>
              <td>Daily passengers</td>
              <td>{fmtInt(last.passengers)}</td>
            </tr>
            <tr>
              <td>Trips abandoned</td>
              <td>{fmtInt(last.abandoned)}</td>
            </tr>
            <tr>
              <td>Avg journey</td>
              <td>{last.avgJourneyMin.toFixed(1)} min</td>
            </tr>
            <tr>
              <td>CO₂</td>
              <td>{last.co2Tonnes.toFixed(1)} t/day</td>
            </tr>
            <tr>
              <td>Avg congestion</td>
              <td>{(last.congestion * 100).toFixed(0)}%</td>
            </tr>
          </tbody>
        </table>
      )}
      <Spark title="Daily passengers" data={hist.map((d) => d.passengers)} color="#58a6ff" />
      <Spark title="Profit (£)" data={hist.map((d) => d.profit)} color="#3fb950" zero />
      <Spark title="Happiness %" data={hist.map((d) => d.happiness)} color="#d29922" />
      <Spark title="CO₂ t/day" data={hist.map((d) => d.co2Tonnes)} color="#8b949e" />
    </div>
  );
}

function Spark({ title, data, color, zero }: { title: string; data: number[]; color: string; zero?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = (canvas.width = canvas.clientWidth * 2);
    const h = (canvas.height = 80);
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;
    let min = Math.min(...data);
    let max = Math.max(...data);
    if (zero) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
    if (max === min) max = min + 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 6 - ((v - min) / (max - min)) * (h - 12);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (zero && min < 0) {
      const y0 = h - 6 - ((0 - min) / (max - min)) * (h - 12);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(w, y0);
      ctx.stroke();
    }
  }, [data, color, zero]);
  return (
    <div className="spark">
      <small className="dim">{title}</small>
      <canvas ref={ref} />
    </div>
  );
}

/* --------------------------------------------------------- achievements */

function Achievements({ snap }: { snap: UISnapshot }) {
  return (
    <div className="panel-body">
      <h3>Transport awards</h3>
      {ACHIEVEMENTS.map((a) => {
        const got = snap.achievements.includes(a.id);
        return (
          <div key={a.id} className={got ? 'ach got' : 'ach'}>
            <span>{got ? '🏆' : '🔒'}</span>
            <div>
              <b>{a.name}</b>
              <small className="dim"> {a.desc}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Help() {
  return (
    <div className="panel-body">
      <h3>Commissioner's handbook</h3>
      <p>
        You run all public transport in London Zone 1. Thousands of Londoners plan every journey individually —
        walk, bus, tram, Tube, river — and pick whatever is fastest and cheapest for them.
      </p>
      <ul className="help-list">
        <li>🖱️ Drag to pan, scroll to zoom. Click things to inspect them.</li>
        <li>🚌 Bus/tram routes snap to streets. Place stops along roads; the route follows the network.</li>
        <li>🚇 New Underground lines cost a fortune per km — but move huge crowds under the traffic.</li>
        <li>⛴️ River buses connect the Thames piers.</li>
        <li>📈 Watch the demand heatmap to find under-served areas.</li>
        <li>🚦 Congestion slows buses at rush hour — bus lanes and the congestion charge help.</li>
        <li>💷 Fares fund the network. Too high and passengers walk or drive; too low and you bleed money.</li>
        <li>🌧️ Rain fills buses; snow and strikes break timetables. Watch the news ticker.</li>
        <li>⏸ Space pauses. Keys 1–3 set speed. Esc cancels a draft. Backspace undoes a stop.</li>
      </ul>
    </div>
  );
}
