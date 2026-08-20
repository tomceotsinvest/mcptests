import { useEffect, useState } from 'react'
import { useJarvis } from './hooks/useJarvis.js'
import { ReactorCore } from './components/ReactorCore.jsx'
import { Transcript } from './components/Transcript.jsx'
import { CommandBar } from './components/CommandBar.jsx'
import { StatusRail } from './components/StatusRail.jsx'
import './styles/jarvis.css'

const CLOCK_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export default function App() {
  const jarvis = useJarvis()
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={`jarvis jarvis--${jarvis.status}`}>
      <div className="jarvis__scanlines" aria-hidden="true" />

      <header className="masthead">
        <div className="masthead__brand">
          <h1>J.A.R.V.I.S.</h1>
          <p>Just A Rather Very Intelligent System</p>
        </div>
        <div className="masthead__clock">
          <span className="masthead__time">{CLOCK_FORMAT.format(clock)}</span>
          <span className="masthead__date">{DATE_FORMAT.format(clock)}</span>
        </div>
      </header>

      {jarvis.error && (
        <p className="banner banner--error" role="status">
          {jarvis.error}
        </p>
      )}

      <main className="stage">
        <section className="stage__core">
          <ReactorCore status={jarvis.status} />
        </section>

        <section className="stage__feed">
          <Transcript entries={jarvis.entries} partial={jarvis.partial} status={jarvis.status} />
          <CommandBar
            onSend={jarvis.send}
            onToggleListening={jarvis.toggleListening}
            listening={jarvis.listening}
            voiceEnabled={jarvis.memoryState.settings.voice}
            onVoiceToggle={jarvis.setVoiceEnabled}
            onClear={jarvis.clearTranscript}
            capabilities={jarvis.capabilities}
            busy={jarvis.status === 'thinking'}
          />
        </section>

        <StatusRail
          linkStatus={jarvis.linkStatus}
          memoryState={jarvis.memoryState}
          now={jarvis.now}
          capabilities={jarvis.capabilities}
        />
      </main>
    </div>
  )
}
