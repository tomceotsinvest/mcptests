import { formatDuration, parseDuration } from '../duration.js'
import { plural, titleCase } from '../text.js'

const SET_TIMER = [
  /^(?:set|start|create|make|put on)\s+(?:a|an|the)?\s*timer\s+(?:for\s+|of\s+)?(.+)$/,
  /^(?:set|start|create|make)\s+(?:a|an)?\s*(.+?)\s+timer(?:\s+(?:called|named|for)\s+(.+))?$/,
  /^timer\s+(?:for\s+)?(.+)$/,
  /^(?:remind me|wake me|ping me)\s+in\s+(.+)$/,
]

const LABEL_SUFFIX = /\s+(?:called|named|labelled|labeled|for)\s+(.+)$/

export const timers = {
  id: 'timers',
  title: 'Timers',
  help: [
    { command: 'set a timer for 5 minutes', description: 'countdown, optionally "called pasta"' },
    { command: 'list timers / cancel the pasta timer', description: 'inspect or stop countdowns' },
  ],

  match(ctx) {
    const { text, memory, now } = ctx

    if (/^(?:cancel|stop|clear|kill)\s+(?:all\s+)?(?:my\s+)?timers?$/.test(text)) {
      const running = memory.getState().timers
      if (!running.length) return { text: 'There are no timers running, sir.' }
      if (/all/.test(text) || running.length === 1) {
        const count = memory.cancelAllTimers()
        return { text: `Cancelled ${plural(count, 'timer')}.` }
      }
      return {
        text: `You have ${plural(running.length, 'timer')} running. Which one shall I cancel, sir?`,
      }
    }

    const cancelNamed = /^(?:cancel|stop|clear|kill)\s+(?:the\s+)?(.+?)\s*timer$/.exec(text)
    if (cancelNamed) {
      const cancelled = memory.cancelTimer(cancelNamed[1].trim())
      return cancelled
        ? { text: `Cancelled the ${cancelled.label || 'unnamed'} timer.` }
        : { text: `I have no timer named "${cancelNamed[1].trim()}", sir.` }
    }

    if (/^(?:list|show|what)\b.*\btimers?\b/.test(text) || /^timers$/.test(text) || /how long (?:is )?left/.test(text)) {
      const running = memory.getState().timers
      if (!running.length) return { text: 'No timers are running, sir.' }
      const lines = running.map((timer) => {
        const remaining = formatDuration(timer.endsAt - now.getTime())
        return `• ${timer.label ? titleCase(timer.label) : 'Timer'} — ${remaining} remaining`
      })
      return {
        text: `${plural(running.length, 'timer')} running:\n${lines.join('\n')}`,
        speak: `${plural(running.length, 'timer')} running. ${running
          .map((timer) => `${timer.label || 'unnamed'}, ${formatDuration(timer.endsAt - now.getTime())}`)
          .join('. ')}.`,
      }
    }

    for (const pattern of SET_TIMER) {
      const match = pattern.exec(text)
      if (!match) continue
      let phrase = (match[1] ?? '').trim()
      let label = (match[2] ?? '').trim()
      if (!label) {
        const suffix = LABEL_SUFFIX.exec(phrase)
        if (suffix) {
          label = suffix[1].trim()
          phrase = phrase.slice(0, suffix.index).trim()
        }
      }
      const durationMs = parseDuration(phrase)
      if (!durationMs) continue
      const timer = memory.addTimer({ label, durationMs })
      const name = label ? ` called ${titleCase(label)}` : ''
      return { text: `Timer${name} set for ${formatDuration(durationMs)}, sir.`, data: { timer } }
    }

    return null
  },
}
