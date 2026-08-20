import { describe, expect, it } from 'vitest'
import { convert, lookupUnit, parseConversion, unitName } from '../units.js'

describe('convert', () => {
  it('converts length', () => {
    expect(convert(10, 'km', 'miles').value).toBeCloseTo(6.21371, 5)
    expect(convert(1, 'foot', 'inches').value).toBeCloseTo(12, 10)
  })

  it('converts temperature', () => {
    expect(convert(100, 'c', 'f').value).toBeCloseTo(212, 10)
    expect(convert(32, 'f', 'celsius').value).toBeCloseTo(0, 10)
    expect(convert(0, 'c', 'kelvin').value).toBeCloseTo(273.15, 10)
  })

  it('converts mass, volume, speed and data', () => {
    expect(convert(1, 'kg', 'lbs').value).toBeCloseTo(2.20462, 5)
    expect(convert(1, 'cup', 'ml').value).toBeCloseTo(236.5882365, 6)
    expect(convert(60, 'mph', 'kph').value).toBeCloseTo(96.56064, 5)
    expect(convert(1, 'gb', 'mb').value).toBe(1000)
    expect(convert(1, 'gib', 'mib').value).toBe(1024)
  })

  it('refuses cross-category and unknown units', () => {
    expect(convert(1, 'kg', 'miles')).toBeNull()
    expect(convert(1, 'bananas', 'miles')).toBeNull()
  })
})

describe('parseConversion', () => {
  it('reads both phrasings', () => {
    expect(parseConversion('convert 10 km to miles')).toMatchObject({ value: 10, from: 'km', to: 'miles' })
    expect(parseConversion('how many miles in 10 km')).toMatchObject({ value: 10, from: 'km', to: 'miles' })
    expect(parseConversion('what is 2 kg in pounds')).toMatchObject({ value: 2 })
  })

  it('ignores non-conversions', () => {
    expect(parseConversion('what is 2 + 2')).toBeNull()
    expect(parseConversion('10 km to bananas')).toBeNull()
    expect(parseConversion('set a timer for 10 minutes')).toBeNull()
  })
})

describe('unitName', () => {
  it('pluralises by value', () => {
    expect(unitName(lookupUnit('mile'), 1)).toBe('mile')
    expect(unitName(lookupUnit('mile'), 3)).toBe('miles')
  })
})
