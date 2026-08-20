import { convert, parseConversion, unitName } from '../units.js'
import { formatNumber } from '../math.js'

export const converter = {
  id: 'converter',
  title: 'Unit conversion',
  help: [
    { command: 'convert 10 km to miles', description: 'length, mass, volume, speed, data, temperature' },
    { command: 'how many ml in 3 cups', description: 'the same thing, asked backwards' },
  ],

  match(ctx) {
    const parsed = parseConversion(ctx.text)
    if (!parsed) return null
    const result = convert(parsed.value, parsed.from, parsed.to)
    if (!result) return null
    const fromLabel = unitName(result.from, parsed.value)
    const toLabel = unitName(result.to, result.value)
    return {
      text: `${formatNumber(parsed.value)} ${fromLabel} is ${formatNumber(result.value, 4)} ${toLabel}.`,
    }
  },
}
