const TICKS = Array.from({ length: 48 }, (_, index) => index * (360 / 48))

const LABELS = {
  idle: 'STANDBY',
  listening: 'LISTENING',
  thinking: 'PROCESSING',
  speaking: 'SPEAKING',
}

/** The arc reactor: rings, ticks and a core that reacts to the current state. */
export function ReactorCore({ status = 'idle' }) {
  return (
    <div className={`reactor reactor--${status}`}>
      <svg viewBox="0 0 220 220" role="img" aria-label={`JARVIS status: ${LABELS[status] ?? status}`}>
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent-bright)" stopOpacity="0.95" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle className="reactor__glow" cx="110" cy="110" r="72" fill="url(#coreGlow)" />

        <g className="reactor__ticks">
          {TICKS.map((angle, index) => (
            <rect
              key={angle}
              x="109"
              y="8"
              width="2"
              height={index % 4 === 0 ? 12 : 6}
              rx="1"
              transform={`rotate(${angle} 110 110)`}
              opacity={index % 4 === 0 ? 0.8 : 0.35}
            />
          ))}
        </g>

        <circle className="reactor__ring reactor__ring--outer" cx="110" cy="110" r="94" />
        <circle className="reactor__ring reactor__ring--mid" cx="110" cy="110" r="74" />
        <circle className="reactor__ring reactor__ring--inner" cx="110" cy="110" r="52" />

        <g className="reactor__segments">
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <path
              key={angle}
              d="M110 46 A64 64 0 0 1 165 78"
              transform={`rotate(${angle} 110 110)`}
              fill="none"
            />
          ))}
        </g>

        <circle className="reactor__core" cx="110" cy="110" r="26" />
        <circle className="reactor__pupil" cx="110" cy="110" r="12" />
      </svg>
      <p className="reactor__label">{LABELS[status] ?? status}</p>
    </div>
  )
}
