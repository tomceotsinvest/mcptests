import { canonical, normalize, stripLeadIn } from './text.js'
import { skills as defaultSkills } from './skills/index.js'

export const SOURCE = {
  LOCAL: 'local',
  CLAUDE: 'claude',
  FALLBACK: 'fallback',
  ERROR: 'error',
}

/** Explicit routing: "ask claude ..." always goes upstream. */
const FORCE_LLM = /^(?:ask|hey)\s+claude[,:]?\s+(.+)$/i

const NO_LINK = [
  'That one is beyond my local core, sir.',
  'I cannot answer that offline.',
]

function fallbackText(input) {
  return [
    NO_LINK[input.length % NO_LINK.length],
    'Set ANTHROPIC_API_KEY and start the bridge with `npm run server` to give me the Claude link,',
    'or say "help" for my offline command set.',
  ].join(' ')
}

/**
 * Build the command engine.
 *
 * @param {object} options
 * @param {Array}  options.skills  ordered skill list (defaults to all of them)
 * @param {object} options.memory  store from `createMemory`
 * @param {Function} options.clock returns the current Date (injectable for tests)
 * @param {Function} options.random 0..1 source (injectable for tests)
 * @param {object} options.llm     optional Claude bridge client
 */
export function createBrain({
  skills = defaultSkills,
  memory,
  clock = () => new Date(),
  random = Math.random,
  llm = null,
} = {}) {
  if (!memory) throw new Error('createBrain requires a memory store')

  const help = skills.flatMap((skill) => skill.help ?? [])

  /** Try every local skill in order. Returns null when none claims the input. */
  function runLocal(input, { llmAvailable, llmModel }) {
    const text = stripLeadIn(canonical(input))
    const ctx = {
      input,
      text,
      memory,
      now: clock(),
      random,
      help,
      llmAvailable,
      llmModel,
    }
    for (const skill of skills) {
      const reply = skill.match(ctx)
      if (reply) return { ...reply, source: SOURCE.LOCAL, skill: skill.id }
    }
    return null
  }

  /**
   * Answer one utterance.
   *
   * @param {string} rawInput
   * @param {object} options
   * @param {Array}  options.history prior turns as {role, content}
   * @param {Function} options.onDelta streaming callback for Claude replies
   * @param {AbortSignal} options.signal
   * @returns {Promise<{text:string, source:string, skill?:string, speak?:string, action?:object}>}
   */
  async function respond(rawInput, { history = [], onDelta, signal } = {}) {
    const input = normalize(rawInput)
    if (!input) {
      return { source: SOURCE.FALLBACK, text: 'I did not catch that, sir.' }
    }

    const llmAvailable = Boolean(llm?.isAvailable())
    const forced = FORCE_LLM.exec(input)

    if (!forced) {
      const local = runLocal(input, { llmAvailable, llmModel: llm?.model })
      if (local) return local
    }

    const question = forced ? forced[1] : input

    if (llmAvailable) {
      try {
        const text = await llm.ask({ question, history, onDelta, signal })
        return { source: SOURCE.CLAUDE, text: text.trim(), model: llm.model }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return { source: SOURCE.FALLBACK, text: 'Transmission halted.', silent: true }
        }
        return {
          source: SOURCE.ERROR,
          text: `The Claude link failed: ${error?.message ?? 'unknown error'}.`,
        }
      }
    }

    if (forced) {
      return {
        source: SOURCE.FALLBACK,
        text: 'The Claude link is offline, sir. Start the bridge with `npm run server` and an ANTHROPIC_API_KEY.',
      }
    }

    return { source: SOURCE.FALLBACK, text: fallbackText(input) }
  }

  return { respond, runLocal, help, skills }
}
