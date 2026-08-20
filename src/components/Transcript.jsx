import { useEffect, useRef } from 'react'

const SOURCE_LABEL = {
  local: 'LOCAL CORE',
  claude: 'CLAUDE',
  fallback: 'OFFLINE',
  error: 'FAULT',
}

function timestamp(at) {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** The scrolling conversation log. */
export function Transcript({ entries, partial, status }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries, partial, status])

  return (
    <div className="transcript" role="log" aria-live="polite" aria-label="Conversation log">
      {entries.length === 0 && <p className="transcript__empty">Log cleared. Awaiting instructions.</p>}

      {entries.map((entry) => (
        <article
          key={entry.id}
          className={`entry entry--${entry.role}${entry.tone === 'alert' ? ' entry--alert' : ''}`}
        >
          <header className="entry__meta">
            <span className="entry__who">{entry.role === 'user' ? 'YOU' : 'JARVIS'}</span>
            {entry.role !== 'user' && entry.source && (
              <span className={`entry__source entry__source--${entry.source}`}>
                {SOURCE_LABEL[entry.source] ?? entry.source}
              </span>
            )}
            {entry.at && <time className="entry__time">{timestamp(entry.at)}</time>}
          </header>
          <p className="entry__text">
            {entry.text}
            {entry.pending && <span className="entry__caret" aria-hidden="true" />}
          </p>
        </article>
      ))}

      {partial && (
        <article className="entry entry--user entry--partial">
          <header className="entry__meta">
            <span className="entry__who">YOU</span>
            <span className="entry__source">HEARING…</span>
          </header>
          <p className="entry__text">{partial}</p>
        </article>
      )}

      {status === 'thinking' && (
        <p className="transcript__thinking" aria-hidden="true">
          <span />
          <span />
          <span />
        </p>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
