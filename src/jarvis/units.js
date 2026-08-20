/**
 * Unit conversion table + a parser for spoken conversion requests.
 * Every linear unit is stored as a multiplier against its category's base
 * unit; temperature is handled separately because it is affine, not linear.
 */

const LINEAR = {
  // length — base: metre
  length: {
    base: 'metres',
    units: {
      kilometre: { factor: 1000, name: ['kilometre', 'kilometres'], aliases: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'klick', 'klicks'] },
      metre: { factor: 1, name: ['metre', 'metres'], aliases: ['m', 'meter', 'meters', 'metre', 'metres'] },
      centimetre: { factor: 0.01, name: ['centimetre', 'centimetres'], aliases: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'] },
      millimetre: { factor: 0.001, name: ['millimetre', 'millimetres'], aliases: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'] },
      mile: { factor: 1609.344, name: ['mile', 'miles'], aliases: ['mi', 'mile', 'miles'] },
      nauticalMile: { factor: 1852, name: ['nautical mile', 'nautical miles'], aliases: ['nmi', 'nautical mile', 'nautical miles'] },
      yard: { factor: 0.9144, name: ['yard', 'yards'], aliases: ['yd', 'yds', 'yard', 'yards'] },
      foot: { factor: 0.3048, name: ['foot', 'feet'], aliases: ['ft', 'foot', 'feet'] },
      inch: { factor: 0.0254, name: ['inch', 'inches'], aliases: ['in', 'inch', 'inches'] },
    },
  },
  // mass — base: gram
  mass: {
    base: 'grams',
    units: {
      tonne: { factor: 1e6, name: ['tonne', 'tonnes'], aliases: ['t', 'tonne', 'tonnes', 'metric ton', 'metric tons'] },
      kilogram: { factor: 1000, name: ['kilogram', 'kilograms'], aliases: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes'] },
      gram: { factor: 1, name: ['gram', 'grams'], aliases: ['g', 'gram', 'grams', 'gramme', 'grammes'] },
      milligram: { factor: 0.001, name: ['milligram', 'milligrams'], aliases: ['mg', 'milligram', 'milligrams'] },
      pound: { factor: 453.59237, name: ['pound', 'pounds'], aliases: ['lb', 'lbs', 'pound', 'pounds'] },
      ounce: { factor: 28.349523125, name: ['ounce', 'ounces'], aliases: ['oz', 'ounce', 'ounces'] },
      stone: { factor: 6350.29318, name: ['stone', 'stone'], aliases: ['st', 'stone', 'stones'] },
    },
  },
  // volume — base: litre
  volume: {
    base: 'litres',
    units: {
      litre: { factor: 1, name: ['litre', 'litres'], aliases: ['l', 'litre', 'litres', 'liter', 'liters'] },
      millilitre: { factor: 0.001, name: ['millilitre', 'millilitres'], aliases: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'] },
      gallon: { factor: 3.785411784, name: ['gallon', 'gallons'], aliases: ['gal', 'gallon', 'gallons'] },
      quart: { factor: 0.946352946, name: ['quart', 'quarts'], aliases: ['qt', 'quart', 'quarts'] },
      pint: { factor: 0.473176473, name: ['pint', 'pints'], aliases: ['pt', 'pint', 'pints'] },
      cup: { factor: 0.2365882365, name: ['cup', 'cups'], aliases: ['cup', 'cups'] },
      fluidOunce: { factor: 0.0295735295625, name: ['fluid ounce', 'fluid ounces'], aliases: ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'] },
    },
  },
  // speed — base: metre per second
  speed: {
    base: 'metres per second',
    units: {
      metrePerSecond: { factor: 1, name: ['metre per second', 'metres per second'], aliases: ['m/s', 'mps', 'metre per second', 'metres per second', 'meters per second', 'meter per second'] },
      kilometrePerHour: { factor: 1000 / 3600, name: ['kilometre per hour', 'kilometres per hour'], aliases: ['kph', 'km/h', 'kmh', 'kilometres per hour', 'kilometers per hour', 'kilometre per hour', 'kilometer per hour'] },
      milePerHour: { factor: 0.44704, name: ['mile per hour', 'miles per hour'], aliases: ['mph', 'mi/h', 'miles per hour', 'mile per hour'] },
      knot: { factor: 1852 / 3600, name: ['knot', 'knots'], aliases: ['kn', 'knot', 'knots'] },
    },
  },
  // duration — base: second
  duration: {
    base: 'seconds',
    units: {
      second: { factor: 1, name: ['second', 'seconds'], aliases: ['s', 'sec', 'secs', 'second', 'seconds'] },
      minute: { factor: 60, name: ['minute', 'minutes'], aliases: ['min', 'mins', 'minute', 'minutes'] },
      hour: { factor: 3600, name: ['hour', 'hours'], aliases: ['h', 'hr', 'hrs', 'hour', 'hours'] },
      day: { factor: 86400, name: ['day', 'days'], aliases: ['d', 'day', 'days'] },
      week: { factor: 604800, name: ['week', 'weeks'], aliases: ['w', 'wk', 'week', 'weeks'] },
    },
  },
  // digital storage — base: byte (decimal SI, matching how drives are sold)
  data: {
    base: 'bytes',
    units: {
      bit: { factor: 0.125, name: ['bit', 'bits'], aliases: ['bit', 'bits'] },
      byte: { factor: 1, name: ['byte', 'bytes'], aliases: ['b', 'byte', 'bytes'] },
      kilobyte: { factor: 1e3, name: ['kilobyte', 'kilobytes'], aliases: ['kb', 'kilobyte', 'kilobytes'] },
      megabyte: { factor: 1e6, name: ['megabyte', 'megabytes'], aliases: ['mb', 'megabyte', 'megabytes'] },
      gigabyte: { factor: 1e9, name: ['gigabyte', 'gigabytes'], aliases: ['gb', 'gigabyte', 'gigabytes'] },
      terabyte: { factor: 1e12, name: ['terabyte', 'terabytes'], aliases: ['tb', 'terabyte', 'terabytes'] },
      kibibyte: { factor: 1024, name: ['kibibyte', 'kibibytes'], aliases: ['kib', 'kibibyte', 'kibibytes'] },
      mebibyte: { factor: 1024 ** 2, name: ['mebibyte', 'mebibytes'], aliases: ['mib', 'mebibyte', 'mebibytes'] },
      gibibyte: { factor: 1024 ** 3, name: ['gibibyte', 'gibibytes'], aliases: ['gib', 'gibibyte', 'gibibytes'] },
    },
  },
}

const TEMPERATURE = {
  celsius: { name: ['degree celsius', 'degrees celsius'], aliases: ['c', 'celsius', 'centigrade', 'degrees c', 'degree c', 'degrees celsius', 'degree celsius'] },
  fahrenheit: { name: ['degree fahrenheit', 'degrees fahrenheit'], aliases: ['f', 'fahrenheit', 'degrees f', 'degree f', 'degrees fahrenheit', 'degree fahrenheit'] },
  kelvin: { name: ['kelvin', 'kelvin'], aliases: ['k', 'kelvin', 'kelvins'] },
}

/** alias -> { category, key } lookup, built once at module load. */
const INDEX = new Map()
for (const [category, group] of Object.entries(LINEAR)) {
  for (const [key, unit] of Object.entries(group.units)) {
    for (const alias of unit.aliases) INDEX.set(alias, { category, key })
  }
}
for (const [key, unit] of Object.entries(TEMPERATURE)) {
  for (const alias of unit.aliases) INDEX.set(alias, { category: 'temperature', key })
}

/** Resolve a spoken unit name. Returns null when unknown. */
export function lookupUnit(token) {
  if (!token) return null
  const cleaned = String(token).toLowerCase().trim().replace(/[.]/g, '').replace(/\s+/g, ' ')
  return INDEX.get(cleaned) ?? INDEX.get(cleaned.replace(/s$/, '')) ?? null
}

/** Display name for a resolved unit, singular or plural by value. */
export function unitName({ category, key }, value) {
  const forms = category === 'temperature' ? TEMPERATURE[key].name : LINEAR[category].units[key].name
  return Math.abs(value) === 1 ? forms[0] : forms[1]
}

const toCelsius = { celsius: (v) => v, fahrenheit: (v) => (v - 32) * (5 / 9), kelvin: (v) => v - 273.15 }
const fromCelsius = { celsius: (v) => v, fahrenheit: (v) => v * (9 / 5) + 32, kelvin: (v) => v + 273.15 }

/**
 * Convert between two units.
 * @returns {{value:number, from:object, to:object}|null} null when the units
 *   are unknown or belong to different categories.
 */
export function convert(value, fromToken, toToken) {
  const from = lookupUnit(fromToken)
  const to = lookupUnit(toToken)
  if (!from || !to || from.category !== to.category) return null
  if (from.category === 'temperature') {
    return { value: fromCelsius[to.key](toCelsius[from.key](value)), from, to }
  }
  const group = LINEAR[from.category]
  const base = value * group.units[from.key].factor
  return { value: base / group.units[to.key].factor, from, to }
}

const UNIT_TOKEN = "[a-z°/ ]+?"
const PATTERNS = [
  new RegExp(`^(?:convert\\s+)?(-?[\\d.,]+)\\s*(${UNIT_TOKEN})\\s+(?:in|to|into|as)\\s+(${UNIT_TOKEN})$`),
  new RegExp(`^how many\\s+(${UNIT_TOKEN})\\s+(?:are\\s+|is\\s+)?(?:in|to)\\s+(-?[\\d.,]+)\\s*(${UNIT_TOKEN})$`),
]

/**
 * Parse "convert 10 km to miles", "10 km in miles",
 * "how many miles in 10 km". Returns null when the shape does not match.
 */
export function parseConversion(text) {
  const cleaned = String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/^(?:what(?:'s| is)|whats|how much is|tell me)\s+/, '')
    .replace(/[?.!]+$/, '')
    .replace(/°/g, ' degrees ')
    .replace(/\s+/g, ' ')
    .trim()

  for (const [index, pattern] of PATTERNS.entries()) {
    const match = pattern.exec(cleaned)
    if (!match) continue
    const [rawValue, rawFrom, rawTo] = index === 0
      ? [match[1], match[2], match[3]]
      : [match[2], match[3], match[1]]
    const value = Number(rawValue.replace(/,/g, ''))
    if (!Number.isFinite(value)) continue
    const from = lookupUnit(rawFrom)
    const to = lookupUnit(rawTo)
    if (!from || !to) continue
    return { value, from: rawFrom.trim(), to: rawTo.trim(), resolved: { from, to } }
  }
  return null
}
