import type { Engine } from '../game/sim/engine';
import type { Overlay, Tool, UISnapshot } from '../game/types';

const TOOLS: { tool: Tool; icon: string; label: string }[] = [
  { tool: 'select', icon: '🖱️', label: 'Inspect' },
  { tool: 'busRoute', icon: '🚌', label: 'Bus route' },
  { tool: 'tramRoute', icon: '🚋', label: 'Tram line' },
  { tool: 'tubeLine', icon: '🚇', label: 'Underground line' },
  { tool: 'boatRoute', icon: '⛴️', label: 'River bus' },
  { tool: 'delete', icon: '🗑️', label: 'Demolish' },
];

const OVERLAYS: { overlay: Overlay; icon: string; label: string }[] = [
  { overlay: 'none', icon: '🗺️', label: 'Plain map' },
  { overlay: 'demand', icon: '🔥', label: 'Demand heatmap' },
  { overlay: 'congestion', icon: '🚦', label: 'Congestion' },
  { overlay: 'coverage', icon: '🎯', label: 'Coverage' },
];

export function Toolbar({ engine, snap }: { engine: Engine; snap: UISnapshot }) {
  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={snap.tool === t.tool ? 'active' : ''}
          title={t.label}
          onClick={() => engine.setTool(t.tool)}
        >
          <span>{t.icon}</span>
          <small>{t.label}</small>
        </button>
      ))}
      <div className="divider" />
      {OVERLAYS.map((o) => (
        <button
          key={o.overlay}
          className={snap.overlay === o.overlay ? 'active' : ''}
          title={o.label}
          onClick={() => engine.setOverlay(o.overlay)}
        >
          <span>{o.icon}</span>
          <small>{o.label}</small>
        </button>
      ))}
    </div>
  );
}
