/**
 * JARVIS's persistent state: notes, running timers and preferences.
 *
 * The store is storage-agnostic — pass `window.localStorage` in the browser,
 * or nothing at all in tests (it then keeps everything in RAM). Every
 * storage access is guarded because Safari private mode throws on write.
 */

export const STORAGE_KEY = 'jarvis.memory.v1'

const DEFAULT_STATE = {
  notes: [],
  timers: [],
  settings: { voice: true, autoListen: false },
}

function safeParse(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function hydrate(stored) {
  const state = structuredClone(DEFAULT_STATE)
  if (!stored) return state
  if (Array.isArray(stored.notes)) {
    state.notes = stored.notes
      .filter((note) => note && typeof note.text === 'string')
      .map((note) => ({ id: String(note.id ?? ''), text: note.text, createdAt: Number(note.createdAt) || 0 }))
  }
  if (Array.isArray(stored.timers)) {
    state.timers = stored.timers
      .filter((timer) => timer && Number.isFinite(Number(timer.endsAt)))
      .map((timer) => ({
        id: String(timer.id ?? ''),
        label: typeof timer.label === 'string' ? timer.label : '',
        endsAt: Number(timer.endsAt),
        durationMs: Number(timer.durationMs) || 0,
      }))
  }
  if (stored.settings && typeof stored.settings === 'object') {
    state.settings = { ...state.settings, ...stored.settings }
  }
  return state
}

export function createMemory({ storage = null, key = STORAGE_KEY, now = () => Date.now() } = {}) {
  let sequence = 0
  const listeners = new Set()

  let state = hydrate(safeParse(readRaw()))

  function readRaw() {
    try {
      return storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  function persist() {
    try {
      storage?.setItem(key, JSON.stringify(state))
    } catch {
      /* storage full or blocked — the session still works, just not across reloads */
    }
  }

  function commit(next) {
    state = next
    persist()
    for (const listener of listeners) listener(state)
    return state
  }

  function nextId(prefix) {
    sequence += 1
    return `${prefix}-${now().toString(36)}-${sequence}`
  }

  return {
    /** Current immutable-by-convention state. Never mutate it in place. */
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    addNote(text) {
      const note = { id: nextId('note'), text: String(text).trim(), createdAt: now() }
      commit({ ...state, notes: [...state.notes, note] })
      return note
    },

    /** Remove by 1-based position (as spoken: "forget note 2"). */
    removeNoteAt(position) {
      const index = position - 1
      if (index < 0 || index >= state.notes.length) return null
      const note = state.notes[index]
      commit({ ...state, notes: state.notes.filter((_, i) => i !== index) })
      return note
    },

    /** Remove the first note whose text contains `needle`. */
    removeNoteMatching(needle) {
      const target = String(needle).toLowerCase().trim()
      const index = state.notes.findIndex((note) => note.text.toLowerCase().includes(target))
      if (index === -1) return null
      const note = state.notes[index]
      commit({ ...state, notes: state.notes.filter((_, i) => i !== index) })
      return note
    },

    clearNotes() {
      const count = state.notes.length
      if (count) commit({ ...state, notes: [] })
      return count
    },

    addTimer({ label = '', durationMs }) {
      const timer = {
        id: nextId('timer'),
        label: String(label).trim(),
        durationMs,
        endsAt: now() + durationMs,
      }
      commit({ ...state, timers: [...state.timers, timer].sort((a, b) => a.endsAt - b.endsAt) })
      return timer
    },

    cancelTimer(idOrLabel) {
      const needle = String(idOrLabel ?? '').toLowerCase().trim()
      const timer = state.timers.find(
        (candidate) => candidate.id === idOrLabel || (needle && candidate.label.toLowerCase() === needle),
      )
      if (!timer) return null
      commit({ ...state, timers: state.timers.filter((candidate) => candidate.id !== timer.id) })
      return timer
    },

    cancelAllTimers() {
      const count = state.timers.length
      if (count) commit({ ...state, timers: [] })
      return count
    },

    /** Remove and return every timer whose deadline has passed. */
    collectDueTimers(at = now()) {
      const due = state.timers.filter((timer) => timer.endsAt <= at)
      if (due.length) {
        commit({ ...state, timers: state.timers.filter((timer) => timer.endsAt > at) })
      }
      return due
    },

    setSetting(name, value) {
      commit({ ...state, settings: { ...state.settings, [name]: value } })
      return state.settings
    },

    reset() {
      commit(structuredClone(DEFAULT_STATE))
    },
  }
}
