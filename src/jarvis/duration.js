/** Parsing and formatting of spoken durations ("an hour and a half"). */

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  ninety: 90, half: 0.5, quarter: 0.25,
}

const UNIT_MS = {
  ms: 1, millisecond: 1, milliseconds: 1,
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
  d: 86_400_000, day: 86_400_000, days: 86_400_000,
}

const WORD_PART = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join('|')
const UNIT_PART = Object.keys(UNIT_MS).sort((a, b) => b.length - a.length).join('|')
// A digit amount may sit flush against its unit ("1h30m"); a word amount must
// be followed by a space, otherwise "and" would read as "an" + "d" (a day).
const CHUNK = new RegExp(
  `(?:(\\d+(?:\\.\\d+)?)\\s*|(${WORD_PART})\\s+)(${UNIT_PART})(?![a-z])`,
  'g',
)

const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
const COMPOUND = new RegExp(`\\b(${Object.keys(TENS).join('|')})[\\s-](${Object.keys(ONES).join('|')})\\b`, 'g')

/**
 * Parse a duration phrase into milliseconds.
 * Supports "5 minutes", "1h30m", "90 seconds", "half an hour",
 * "an hour and a half", "2 hours and 15 minutes", "forty five seconds".
 * @returns {number|null} milliseconds, or null when nothing parses.
 */
export function parseDuration(text) {
  if (!text) return null
  let source = String(text).toLowerCase().replace(/\s+/g, ' ').trim()
  // "forty five" -> "45", so compound word numbers survive tokenising.
  source = source.replace(COMPOUND, (_, tens, ones) => String(TENS[tens] + ONES[ones]))
  // "half an hour" / "quarter of an hour" -> "half hour" / "quarter hour"
  source = source.replace(/\b(half|quarter)\s+(?:of\s+)?an?\s+/g, '$1 ')

  let total = 0
  let matched = false
  let lastUnitMs = 0
  for (const match of source.matchAll(CHUNK)) {
    const rawNumber = match[1] ?? match[2]
    const amount = Object.hasOwn(WORD_NUMBERS, rawNumber) ? WORD_NUMBERS[rawNumber] : Number(rawNumber)
    if (!Number.isFinite(amount)) continue
    lastUnitMs = UNIT_MS[match[3]]
    total += amount * lastUnitMs
    matched = true
  }
  if (!matched) return null
  // "... and a half" adds half of the most recently named unit.
  if (/\band\s+(?:a\s+)?half$/.test(source)) total += lastUnitMs / 2
  return total > 0 ? Math.round(total) : null
}

/** Milliseconds -> "1 hour 30 minutes". Rounds up to whole seconds. */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds === 0) return '0 seconds'
  const parts = []
  const table = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ]
  let remaining = totalSeconds
  for (const [name, size] of table) {
    const count = Math.floor(remaining / size)
    if (!count) continue
    remaining -= count * size
    parts.push(`${count} ${name}${count === 1 ? '' : 's'}`)
  }
  return parts.slice(0, 2).join(' ')
}

/** Compact countdown for the HUD: 01:30, 12:05:00. */
export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}
