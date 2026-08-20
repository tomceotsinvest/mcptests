import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createBrain, SOURCE } from '../jarvis/brain.js'
import { createMemory } from '../jarvis/memory.js'
import { createLlmClient } from '../jarvis/llm.js'
import { createSpeech } from '../jarvis/speech.js'
import { titleCase } from '../jarvis/text.js'

const HISTORY_TURNS = 12
const BOOT_LINE =
  'JARVIS online. Local core operational. Say "help" for my command set, or just ask me something.'

let sequence = 0
const nextId = () => `entry-${Date.now().toString(36)}-${(sequence += 1)}`

/** A short rising chime for timer alarms — no audio assets required. */
function chime() {
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext
  if (!AudioCtx) return
  try {
    const context = new AudioCtx()
    const now = context.currentTime
    for (const [index, frequency] of [660, 880, 1320].entries()) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, now + index * 0.16)
      gain.gain.exponentialRampToValueAtTime(0.25, now + index * 0.16 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.35)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(now + index * 0.16)
      oscillator.stop(now + index * 0.16 + 0.4)
    }
    setTimeout(() => context.close(), 1500)
  } catch {
    /* audio is a nicety, never a failure */
  }
}

export function useJarvis() {
  const memory = useMemo(
    () => createMemory({ storage: typeof window === 'undefined' ? null : window.localStorage }),
    [],
  )
  const llm = useMemo(() => createLlmClient(), [])
  const speech = useMemo(() => createSpeech(), [])
  const brain = useMemo(() => createBrain({ memory, llm }), [memory, llm])

  const [entries, setEntries] = useState(() => [
    { id: nextId(), role: 'jarvis', text: BOOT_LINE, source: SOURCE.LOCAL, at: Date.now() },
  ])
  const [status, setStatus] = useState('idle')
  const [partial, setPartial] = useState('')
  const [error, setError] = useState(null)
  const [memoryState, setMemoryState] = useState(() => memory.getState())
  const [linkStatus, setLinkStatus] = useState(() => llm.status)
  const [tick, setTick] = useState(() => Date.now())

  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const listeningRef = useRef(false)
  const abortRef = useRef(null)

  const appendEntry = useCallback((entry) => {
    const created = { id: nextId(), at: Date.now(), ...entry }
    setEntries((current) => [...current, created])
    return created.id
  }, [])

  const patchEntry = useCallback((id, patch) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    )
  }, [])

  const say = useCallback(
    (text) => {
      if (!memory.getState().settings.voice) {
        setStatus('idle')
        return
      }
      setStatus('speaking')
      speech.speak(text, { onEnd: () => setStatus((current) => (current === 'speaking' ? 'idle' : current)) })
    },
    [memory, speech],
  )

  useEffect(() => memory.subscribe(setMemoryState), [memory])
  useEffect(() => llm.subscribe(setLinkStatus), [llm])

  // Probe the bridge on mount and every 30s so the HUD reflects reality.
  useEffect(() => {
    let cancelled = false
    const probe = () => { if (!cancelled) llm.refresh() }
    probe()
    const id = setInterval(probe, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [llm])

  // One second heartbeat: drives countdowns and fires due timers.
  useEffect(() => {
    const id = setInterval(() => {
      setTick(Date.now())
      const due = memory.collectDueTimers()
      for (const timer of due) {
        const label = timer.label ? `${titleCase(timer.label)} timer` : 'Timer'
        const line = `${label} complete, sir.`
        appendEntry({ role: 'jarvis', text: line, source: SOURCE.LOCAL, tone: 'alert' })
        chime()
        say(line)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [memory, appendEntry, say])

  const applyAction = useCallback(
    (action) => {
      if (!action) return
      if (action.type === 'clear-transcript') {
        setEntries([])
      } else if (action.type === 'stop-speaking') {
        speech.cancelSpeech()
        abortRef.current?.abort()
        setStatus('idle')
      }
    },
    [speech],
  )

  const send = useCallback(
    async (rawText) => {
      const text = String(rawText ?? '').trim()
      if (!text) return

      speech.cancelSpeech()
      setError(null)
      setPartial('')
      appendEntry({ role: 'user', text })
      setStatus('thinking')

      const history = entriesRef.current
        .filter((entry) => !entry.pending && entry.text)
        .slice(-HISTORY_TURNS)
        .map((entry) => ({ role: entry.role === 'user' ? 'user' : 'assistant', content: entry.text }))

      const controller = new AbortController()
      abortRef.current = controller

      let streamId = null
      const onDelta = (chunk) => {
        if (streamId === null) {
          streamId = appendEntry({ role: 'jarvis', text: chunk, source: SOURCE.CLAUDE, pending: true })
        } else {
          setEntries((current) =>
            current.map((entry) =>
              entry.id === streamId ? { ...entry, text: entry.text + chunk } : entry,
            ),
          )
        }
      }

      try {
        const reply = await brain.respond(text, { history, onDelta, signal: controller.signal })
        if (streamId !== null) {
          patchEntry(streamId, { text: reply.text, pending: false, source: reply.source })
        } else if (reply.text) {
          appendEntry({
            role: 'jarvis',
            text: reply.text,
            source: reply.source,
            skill: reply.skill,
            tone: reply.tone,
          })
        }
        applyAction(reply.action)
        if (reply.source === SOURCE.ERROR) setError(reply.text)
        if (!reply.silent && reply.text) say(reply.speak ?? reply.text)
        else setStatus('idle')
      } catch (failure) {
        setError(failure?.message ?? 'something went wrong')
        appendEntry({ role: 'jarvis', text: `Something went wrong: ${failure?.message}`, source: SOURCE.ERROR })
        setStatus('idle')
      } finally {
        abortRef.current = null
      }
    },
    [appendEntry, applyAction, brain, patchEntry, say, speech],
  )

  const stopListening = useCallback(() => {
    listeningRef.current = false
    speech.stopListening()
    setPartial('')
    setStatus((current) => (current === 'listening' ? 'idle' : current))
  }, [speech])

  const startListening = useCallback(() => {
    if (!speech.recognitionSupported || listeningRef.current) return
    speech.cancelSpeech()
    listeningRef.current = true
    setError(null)
    setStatus('listening')
    speech.listen({
      onPartial: setPartial,
      onResult: (text) => { send(text) },
      onEnd: () => {
        listeningRef.current = false
        setPartial('')
        setStatus((current) => (current === 'listening' ? 'idle' : current))
      },
      onError: (failure) => {
        listeningRef.current = false
        setError(failure.message)
        setStatus('idle')
      },
    })
  }, [send, speech])

  const toggleListening = useCallback(() => {
    if (listeningRef.current) stopListening()
    else startListening()
  }, [startListening, stopListening])

  const setVoiceEnabled = useCallback(
    (enabled) => {
      memory.setSetting('voice', enabled)
      if (!enabled) {
        speech.cancelSpeech()
        setStatus((current) => (current === 'speaking' ? 'idle' : current))
      }
    },
    [memory, speech],
  )

  const clearTranscript = useCallback(() => setEntries([]), [])

  useEffect(
    () => () => {
      speech.stopListening()
      speech.cancelSpeech()
    },
    [speech],
  )

  return {
    entries,
    status,
    partial,
    error,
    memoryState,
    linkStatus,
    now: tick,
    capabilities: {
      recognition: speech.recognitionSupported,
      synthesis: speech.synthesisSupported,
    },
    send,
    toggleListening,
    listening: status === 'listening',
    setVoiceEnabled,
    clearTranscript,
    help: brain.help,
  }
}
