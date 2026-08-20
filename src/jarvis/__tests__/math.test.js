import { describe, expect, it } from 'vitest'
import { evaluate, formatNumber, normalizeExpression } from '../math.js'

describe('normalizeExpression', () => {
  it('turns spoken arithmetic into symbols', () => {
    expect(normalizeExpression('what is 12 times 12')).toBe('12 * 12')
    expect(normalizeExpression('7 divided by 2')).toBe('7 / 2')
    expect(normalizeExpression('5 squared')).toBe('5^2')
    expect(normalizeExpression('1,234 plus 1')).toBe('1234 + 1')
  })
})

describe('evaluate', () => {
  it('handles the four operations', () => {
    expect(evaluate('2+2')).toBe(4)
    expect(evaluate('10 - 4')).toBe(6)
    expect(evaluate('6 * 7')).toBe(42)
    expect(evaluate('10 divided by 4')).toBe(2.5)
  })

  it('respects precedence and parentheses', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14)
    expect(evaluate('(2 + 3) * 4')).toBe(20)
    expect(evaluate('-5 + 2')).toBe(-3)
  })

  it('treats exponentiation as right associative', () => {
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512)
  })

  it('supports functions and constants', () => {
    expect(evaluate('sqrt(16)')).toBe(4)
    expect(evaluate('sqrt 81')).toBe(9)
    expect(evaluate('round(2.6)')).toBe(3)
    expect(evaluate('pi')).toBeCloseTo(Math.PI, 10)
  })

  it('rejects anything that is not arithmetic', () => {
    expect(evaluate('what is love')).toBeNull()
    expect(evaluate('')).toBeNull()
    expect(evaluate('2 +')).toBeNull()
    expect(evaluate('(2 + 3')).toBeNull()
    expect(evaluate('alert(1)')).toBeNull()
    expect(evaluate('1/0')).toBeNull() // Infinity is not a useful answer
  })

  it('never executes arbitrary code', () => {
    globalThis.__jarvisPwned = false
    expect(evaluate('globalThis.__jarvisPwned = true')).toBeNull()
    expect(globalThis.__jarvisPwned).toBe(false)
    delete globalThis.__jarvisPwned
  })
})

describe('formatNumber', () => {
  it('groups thousands and trims float noise', () => {
    expect(formatNumber(1234567.891234)).toBe('1,234,567.891234')
    expect(formatNumber(100 / 3)).toBe('33.333333')
    expect(formatNumber(4)).toBe('4')
    expect(formatNumber(-1500)).toBe('-1,500')
  })
})
