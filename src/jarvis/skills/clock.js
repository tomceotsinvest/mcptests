const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'long' })

// Anchored on purpose: only a bare clock reading is answered locally, so
// "what time is it in Tokyo" or "the best time to launch" still reach Claude.
const TIME = [
  /^(?:what(?:'s| is)?\s+)?(?:the\s+)?(?:current\s+)?time(?:\s+is\s+it)?(?:\s+now)?$/,
  /^(?:do you have|got)\s+the\s+time$/,
]
const DATE = [
  /^(?:what(?:'s| is)?\s+)?(?:the\s+|today's\s+)*date(?:\s+is\s+it)?(?:\s+today)?$/,
  /^what(?:'s| is)?\s+today$/,
]
const DAY = [
  /^(?:what(?:'s| is)?\s+)?(?:the\s+)?(?:week)?day(?:\s+is\s+it)?(?:\s+today)?$/,
  /^what day of the week is it$/,
]
const YEAR = /^what(?:'s| is)?\s+(?:the\s+)?year(?:\s+is\s+it)?$/

const matchesAny = (patterns, text) => patterns.some((pattern) => pattern.test(text))

export const clock = {
  id: 'clock',
  title: 'Time & date',
  help: [
    { command: 'what time is it', description: 'the current time' },
    { command: "what's the date", description: 'today’s date and weekday' },
  ],

  match(ctx) {
    const { text, now } = ctx

    if (matchesAny(TIME, text)) return { text: `It is ${TIME_FORMAT.format(now)}, sir.` }
    if (matchesAny(DATE, text)) return { text: `Today is ${DATE_FORMAT.format(now)}.` }
    if (matchesAny(DAY, text)) return { text: `It is ${DAY_FORMAT.format(now)}, sir.` }
    if (YEAR.test(text) || /^what year is it$/.test(text)) return { text: `The year is ${now.getFullYear()}.` }

    return null
  },
}
