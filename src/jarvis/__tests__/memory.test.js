import { beforeEach, describe, expect, it } from 'vitest'
import { createMemory } from '../memory.js'

/** Minimal localStorage stand-in. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    data,
  }
}

let clock

beforeEach(() => {
  clock = 1_000_000
})

const now = () => clock

describe('notes', () => {
  it('stores, lists and removes notes', () => {
    const memory = createMemory({ now })
    memory.addNote('the hangar code is 1701')
    memory.addNote('call Pepper')
    expect(memory.getState().notes).toHaveLength(2)

    expect(memory.removeNoteAt(1).text).toBe('the hangar code is 1701')
    expect(memory.getState().notes).toHaveLength(1)
    expect(memory.removeNoteAt(9)).toBeNull()

    expect(memory.removeNoteMatching('pepper').text).toBe('call Pepper')
    expect(memory.getState().notes).toHaveLength(0)
  })
})

describe('timers', () => {
  it('sorts by deadline and collects only what is due', () => {
    const memory = createMemory({ now })
    memory.addTimer({ label: 'long', durationMs: 60_000 })
    memory.addTimer({ label: 'short', durationMs: 5_000 })
    expect(memory.getState().timers.map((timer) => timer.label)).toEqual(['short', 'long'])

    expect(memory.collectDueTimers(clock + 1000)).toHaveLength(0)
    const due = memory.collectDueTimers(clock + 6000)
    expect(due).toHaveLength(1)
    expect(due[0].label).toBe('short')
    expect(memory.getState().timers).toHaveLength(1)
  })

  it('cancels by label', () => {
    const memory = createMemory({ now })
    memory.addTimer({ label: 'pasta', durationMs: 1000 })
    expect(memory.cancelTimer('PASTA').label).toBe('pasta')
    expect(memory.cancelTimer('pasta')).toBeNull()
  })
})

describe('persistence', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage()
    const first = createMemory({ storage, now })
    first.addNote('remember the milk')
    first.setSetting('voice', false)

    const second = createMemory({ storage, now })
    expect(second.getState().notes[0].text).toBe('remember the milk')
    expect(second.getState().settings.voice).toBe(false)
  })

  it('survives corrupt storage', () => {
    const storage = fakeStorage({ 'jarvis.memory.v1': '{not json' })
    const memory = createMemory({ storage, now })
    expect(memory.getState().notes).toEqual([])
    expect(memory.getState().settings.voice).toBe(true)
  })

  it('survives storage that throws', () => {
    const hostile = {
      getItem() { throw new Error('blocked') },
      setItem() { throw new Error('blocked') },
    }
    const memory = createMemory({ storage: hostile, now })
    expect(() => memory.addNote('still works')).not.toThrow()
    expect(memory.getState().notes).toHaveLength(1)
  })

  it('drops malformed entries when hydrating', () => {
    const storage = fakeStorage({
      'jarvis.memory.v1': JSON.stringify({ notes: [{ nope: true }, { text: 'good' }], timers: 'nonsense' }),
    })
    const memory = createMemory({ storage, now })
    expect(memory.getState().notes).toEqual([{ id: '', text: 'good', createdAt: 0 }])
    expect(memory.getState().timers).toEqual([])
  })
})

describe('subscribe', () => {
  it('notifies listeners on change', () => {
    const memory = createMemory({ now })
    const seen = []
    const unsubscribe = memory.subscribe((state) => seen.push(state.notes.length))
    memory.addNote('one')
    memory.addNote('two')
    unsubscribe()
    memory.addNote('three')
    expect(seen).toEqual([1, 2])
  })
})
