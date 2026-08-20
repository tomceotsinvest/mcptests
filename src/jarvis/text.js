/**
 * Text helpers shared by every skill. Kept dependency-free so the whole
 * command engine can run in a plain Node test process.
 */

const SMART_QUOTES = /[‘’‛]/g
const SMART_DOUBLES = /[“”]/g

/** Collapse whitespace and unify quote characters. Preserves case. */
export function normalize(input) {
  return String(input ?? '')
    .replace(SMART_QUOTES, "'")
    .replace(SMART_DOUBLES, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lower-cased form used for intent matching: drops the "jarvis" wake word,
 * trailing punctuation and trailing politeness so `hey jarvis, what time is
 * it, please?` matches the same rules as `what time is it`.
 */
export function canonical(input) {
  let text = normalize(input).toLowerCase()
  text = text.replace(/^(?:hey|ok|okay|yo|hi)?[\s,]*jarvis[\s,:-]*/i, '')
  text = text.replace(/[\s,]*(?:please|pls|thanks|thank you)\s*[.!?]*$/i, '')
  text = text.replace(/[.!?\s]+$/, '')
  return text.trim()
}

/** Strip a leading verb phrase such as "can you", "could you", "tell me". */
export function stripLeadIn(text) {
  return text
    .replace(/^(?:could|can|would|will)\s+you\s+(?:please\s+)?/, '')
    .replace(/^(?:please\s+)?(?:tell|show|give)\s+me\s+(?:the\s+)?/, '')
    .replace(/^i\s+(?:want|need)\s+(?:you\s+)?to\s+/, '')
    .trim()
}

/** Title-case a label for display: "morning run" -> "Morning Run". */
export function titleCase(text) {
  return normalize(text).replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Pick one item from a list deterministically when `pick` is supplied. */
export function choose(list, pick = Math.random) {
  if (!list.length) return undefined
  const index = Math.min(list.length - 1, Math.max(0, Math.floor(pick() * list.length)))
  return list[index]
}

/** 1 -> "1st", 2 -> "2nd" ... used by the notes skill. */
export function ordinal(n) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

/** "1 timer" / "2 timers" */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
