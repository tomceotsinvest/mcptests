import { formatClock } from '../jarvis/duration.js'

/** Right-hand diagnostics column: link state, timers, notes. */
export function StatusRail({ linkStatus, memoryState, now, capabilities }) {
  const { timers, notes } = memoryState

  return (
    <aside className="rail">
      <section className="panel">
        <h2 className="panel__title">Systems</h2>
        <ul className="panel__list">
          <li className="stat">
            <span className="stat__label">Local core</span>
            <span className="stat__value stat__value--ok">ONLINE</span>
          </li>
          <li className="stat">
            <span className="stat__label">Claude link</span>
            <span className={`stat__value ${linkStatus.available ? 'stat__value--ok' : 'stat__value--off'}`}>
              {linkStatus.available ? 'ACTIVE' : 'OFFLINE'}
            </span>
          </li>
          {linkStatus.model && (
            <li className="stat">
              <span className="stat__label">Model</span>
              <span className="stat__value">{linkStatus.model}</span>
            </li>
          )}
          <li className="stat">
            <span className="stat__label">Microphone</span>
            <span className={`stat__value ${capabilities.recognition ? 'stat__value--ok' : 'stat__value--off'}`}>
              {capabilities.recognition ? 'READY' : 'UNSUPPORTED'}
            </span>
          </li>
          <li className="stat">
            <span className="stat__label">Speech</span>
            <span className={`stat__value ${capabilities.synthesis ? 'stat__value--ok' : 'stat__value--off'}`}>
              {capabilities.synthesis ? 'READY' : 'UNSUPPORTED'}
            </span>
          </li>
        </ul>
        {!linkStatus.available && <p className="panel__note">{linkStatus.reason}</p>}
      </section>

      <section className="panel">
        <h2 className="panel__title">Timers</h2>
        {timers.length === 0 ? (
          <p className="panel__empty">None running</p>
        ) : (
          <ul className="panel__list">
            {timers.map((timer) => (
              <li key={timer.id} className="timer">
                <span className="timer__label">{timer.label || 'Timer'}</span>
                <span className="timer__clock">{formatClock(timer.endsAt - now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">Notes</h2>
        {notes.length === 0 ? (
          <p className="panel__empty">Nothing on file</p>
        ) : (
          <ol className="panel__list panel__list--notes">
            {notes.map((note) => (
              <li key={note.id} className="note">{note.text}</li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  )
}
