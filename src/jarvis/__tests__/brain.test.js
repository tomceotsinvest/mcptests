import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrain, SOURCE } from '../brain.js'
import { createMemory } from '../memory.js'

const FIXED_NOW = new Date('2026-08-20T14:30:00')

let memory
let brain

function makeBrain({ llm = null, random = () => 0 } = {}) {
  memory = createMemory({ now: () => FIXED_NOW.getTime() })
  brain = createBrain({ memory, llm, random, clock: () => FIXED_NOW })
  return brain
}

const ask = (text, options) => brain.respond(text, options)

beforeEach(() => {
  makeBrain()
})

describe('routing', () => {
  it('answers locally without any network', async () => {
    const reply = await ask('what is 2 + 2')
    expect(reply.source).toBe(SOURCE.LOCAL)
    expect(reply.text).toBe('4.')
  })

  it('ignores the wake word, politeness and lead-ins', async () => {
    const a = await ask('Hey JARVIS, what is 6 * 7, please?')
    const b = await ask('can you tell me what is 6 * 7')
    expect(a.text).toBe('42.')
    expect(b.text).toBe('42.')
  })

  it('falls back with instructions when there is no Claude link', async () => {
    const reply = await ask('write me a haiku about titanium')
    expect(reply.source).toBe(SOURCE.FALLBACK)
    expect(reply.text).toContain('ANTHROPIC_API_KEY')
  })

  it('handles empty input', async () => {
    const reply = await ask('   ')
    expect(reply.text).toBe('I did not catch that, sir.')
  })
})

describe('local skills', () => {
  it('does arithmetic and percentages', async () => {
    expect((await ask('what is 15% of 240')).text).toBe('15% of 240 is 36.')
    expect((await ask('calculate sqrt(144)')).text).toBe('12.')
    expect((await ask('what is 2 to the power of 10')).text).toBe('1,024.')
  })

  it('converts units', async () => {
    expect((await ask('convert 10 km to miles')).text).toBe('10 kilometres is 6.2137 miles.')
    expect((await ask('how many ml in 3 cups')).text).toContain('709.7647 millilitres')
  })

  it('tells the time and date', async () => {
    const time = await ask('what time is it')
    expect(time.skill).toBe('clock')
    expect(time.text).toMatch(/^It is .+, sir\.$/)

    const date = await ask("what's the date")
    expect(date.text).toContain('2026')
  })

  it('leaves other time zones to Claude', async () => {
    const reply = await ask('what time is it in Tokyo')
    expect(reply.source).toBe(SOURCE.FALLBACK)
  })

  it('sets, lists and cancels timers', async () => {
    const set = await ask('set a timer for 5 minutes called pasta')
    expect(set.text).toBe('Timer called Pasta set for 5 minutes, sir.')
    expect(memory.getState().timers).toHaveLength(1)

    const list = await ask('list timers')
    expect(list.text).toContain('Pasta')

    const cancel = await ask('cancel the pasta timer')
    expect(cancel.text).toBe('Cancelled the pasta timer.')
    expect(memory.getState().timers).toHaveLength(0)

    expect((await ask('list timers')).text).toBe('No timers are running, sir.')
  })

  it('takes and recalls notes with their original casing', async () => {
    const noted = await ask('remember that the Hangar Code is 1701')
    expect(noted.text).toBe('Noted: "the Hangar Code is 1701".')

    const recalled = await ask('what do you remember')
    expect(recalled.text).toContain('1. the Hangar Code is 1701')

    const forgotten = await ask('forget about the hangar code')
    expect(forgotten.text).toContain('Forgotten')
    expect(memory.getState().notes).toHaveLength(0)
  })

  it('rolls dice deterministically when the source is fixed', async () => {
    makeBrain({ random: () => 0.999999 })
    expect((await ask('roll a d20')).text).toBe('A 20 on a d20.')
    makeBrain({ random: () => 0 })
    expect((await ask('flip a coin')).text).toBe('Heads.')
    expect((await ask('random number between 1 and 10')).text).toBe('1')
  })

  it('reports diagnostics', async () => {
    await ask('remember that the suit needs a service')
    const status = await ask('status')
    expect(status.text).toContain('Local core: online')
    expect(status.text).toContain('Claude link: offline')
    expect(status.text).toContain('Notes: 1 entry')
  })

  it('mutes, unmutes and clears', async () => {
    const mute = await ask('mute')
    expect(memory.getState().settings.voice).toBe(false)
    expect(mute.silent).toBe(true)

    await ask('unmute')
    expect(memory.getState().settings.voice).toBe(true)

    const clear = await ask('clear the log')
    expect(clear.action).toEqual({ type: 'clear-transcript' })
  })

  it('lists its own command set', async () => {
    const help = await ask('help')
    expect(help.text).toContain('set a timer for 5 minutes')
    expect(help.text.split('\n').length).toBeGreaterThan(5)
  })
})

describe('claude link', () => {
  function fakeLlm(overrides = {}) {
    return {
      model: 'claude-opus-5',
      isAvailable: () => true,
      ask: vi.fn(async ({ onDelta }) => {
        onDelta?.('Certainly, ')
        onDelta?.('sir.')
        return 'Certainly, sir.'
      }),
      ...overrides,
    }
  }

  it('routes unknown questions upstream and streams them', async () => {
    const llm = fakeLlm()
    makeBrain({ llm })
    const deltas = []
    const reply = await ask('why is the sky blue', { onDelta: (chunk) => deltas.push(chunk) })

    expect(reply.source).toBe(SOURCE.CLAUDE)
    expect(reply.text).toBe('Certainly, sir.')
    expect(deltas).toEqual(['Certainly, ', 'sir.'])
    expect(llm.ask).toHaveBeenCalledOnce()
  })

  it('keeps local skills local even when the link is up', async () => {
    const llm = fakeLlm()
    makeBrain({ llm })
    const reply = await ask('what is 9 * 9')
    expect(reply.source).toBe(SOURCE.LOCAL)
    expect(llm.ask).not.toHaveBeenCalled()
  })

  it('forces an upstream call for "ask claude ..."', async () => {
    const llm = fakeLlm()
    makeBrain({ llm })
    const reply = await ask('ask claude what is 2 + 2')
    expect(reply.source).toBe(SOURCE.CLAUDE)
    expect(llm.ask.mock.calls[0][0].question).toBe('what is 2 + 2')
  })

  it('explains that the link is down when forced offline', async () => {
    const reply = await ask('ask claude for a poem')
    expect(reply.source).toBe(SOURCE.FALLBACK)
    expect(reply.text).toContain('npm run server')
  })

  it('surfaces upstream errors without crashing', async () => {
    makeBrain({ llm: fakeLlm({ ask: vi.fn().mockRejectedValue(new Error('rate limited')) }) })
    const reply = await ask('tell me a story')
    expect(reply.source).toBe(SOURCE.ERROR)
    expect(reply.text).toContain('rate limited')
  })

  it('treats an aborted request as a quiet stop', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    makeBrain({ llm: fakeLlm({ ask: vi.fn().mockRejectedValue(abortError) }) })
    const reply = await ask('tell me a story')
    expect(reply.silent).toBe(true)
  })
})

describe('clock guards', () => {
  it('only answers bare clock questions locally', async () => {
    for (const phrase of ['what time is it', 'time', "what's the time", 'the current time']) {
      expect((await ask(phrase)).skill).toBe('clock')
    }
    for (const phrase of ['what is the best time to launch', 'what time is it in Tokyo', 'time flies']) {
      expect((await ask(phrase)).source).toBe(SOURCE.FALLBACK)
    }
  })

  it('answers the date, weekday and year', async () => {
    expect((await ask('what day is it')).text).toBe('It is Thursday, sir.')
    expect((await ask('what year is it')).text).toBe('The year is 2026.')
    expect((await ask("what's the date")).text).toContain('August')
  })
})
