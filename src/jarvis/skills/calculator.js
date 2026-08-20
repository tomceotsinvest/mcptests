import { evaluate, formatNumber, normalizeExpression } from '../math.js'

const PERCENT_OF = /^(?:what(?:'s| is)|whats|calculate|compute)?\s*(-?[\d.,]+)\s*(?:%|percent)\s+of\s+(-?[\d.,]+)$/
const PERCENT_CHANGE = /^(?:what(?:'s| is)|whats)?\s*(?:the\s+)?percent(?:age)?\s+(?:increase|change)\s+from\s+(-?[\d.,]+)\s+to\s+(-?[\d.,]+)$/

const MATH_HINT = /(?:[+\-*/^%]|\bplus\b|\bminus\b|\btimes\b|\bdivided by\b|\bmultiplied by\b|\bsquared\b|\bcubed\b|\bsquare root\b|\bsqrt\b|\bpercent\b|\bto the power of\b)/

const num = (raw) => Number(String(raw).replace(/,/g, ''))

export const calculator = {
  id: 'calculator',
  title: 'Arithmetic',
  help: [
    { command: 'what is 12 * 7', description: 'arithmetic, powers, roots, parentheses' },
    { command: '15% of 240', description: 'percentages' },
  ],

  match(ctx) {
    const { text } = ctx

    const percentOf = PERCENT_OF.exec(text)
    if (percentOf) {
      const [, percent, total] = percentOf
      const value = (num(percent) / 100) * num(total)
      return { text: `${percent}% of ${total} is ${formatNumber(value)}.` }
    }

    const percentChange = PERCENT_CHANGE.exec(text)
    if (percentChange) {
      const from = num(percentChange[1])
      const to = num(percentChange[2])
      if (from === 0) return { text: 'A percentage change from zero is undefined, sir.' }
      const delta = ((to - from) / Math.abs(from)) * 100
      const direction = delta >= 0 ? 'an increase' : 'a decrease'
      return { text: `That is ${direction} of ${formatNumber(Math.abs(delta), 2)}%.` }
    }

    // Only take the question if it actually looks like arithmetic — otherwise
    // "what is the plan" would be swallowed by the parser.
    const expression = normalizeExpression(text)
    if (!MATH_HINT.test(expression) && !/^\s*[\d.,\s()]+$/.test(expression)) return null
    if (!/\d/.test(expression)) return null

    const value = evaluate(text)
    if (value === null) return null
    return { text: `${formatNumber(value)}.`, speak: formatNumber(value) }
  },
}
