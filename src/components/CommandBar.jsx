import { useState } from 'react'

const SUGGESTIONS = [
  'status',
  'what time is it',
  'set a timer for 5 minutes',
  'convert 10 km to miles',
  'what is 15% of 240',
  'remember that the hangar code is 1701',
  'help',
]

/** Text input, microphone control and the quick-command chips. */
export function CommandBar({
  onSend,
  onToggleListening,
  listening,
  voiceEnabled,
  onVoiceToggle,
  onClear,
  capabilities,
  busy,
}) {
  const [draft, setDraft] = useState('')

  const submit = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    onSend(text)
  }

  return (
    <div className="command">
      <div className="command__chips">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" className="chip" onClick={() => onSend(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      <form className="command__bar" onSubmit={submit}>
        <button
          type="button"
          className={`icon-button icon-button--mic${listening ? ' is-active' : ''}`}
          onClick={onToggleListening}
          disabled={!capabilities.recognition}
          title={
            capabilities.recognition
              ? listening ? 'Stop listening' : 'Speak to JARVIS'
              : 'Speech recognition is not supported in this browser'
          }
          aria-pressed={listening}
        >
          <span aria-hidden="true">{listening ? '■' : '🎙'}</span>
          <span className="sr-only">{listening ? 'Stop listening' : 'Start listening'}</span>
        </button>

        <input
          className="command__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={listening ? 'Listening…' : 'Speak or type a command'}
          aria-label="Command input"
          autoComplete="off"
          spellCheck="false"
        />

        <button type="submit" className="icon-button icon-button--send" disabled={busy || !draft.trim()}>
          <span aria-hidden="true">▶</span>
          <span className="sr-only">Send</span>
        </button>
      </form>

      <div className="command__toggles">
        <button
          type="button"
          className={`toggle${voiceEnabled ? ' is-on' : ''}`}
          onClick={() => onVoiceToggle(!voiceEnabled)}
          disabled={!capabilities.synthesis}
          aria-pressed={voiceEnabled}
        >
          {voiceEnabled ? '🔊 Voice on' : '🔇 Voice off'}
        </button>
        <button type="button" className="toggle" onClick={onClear}>
          Clear log
        </button>
      </div>
    </div>
  )
}
