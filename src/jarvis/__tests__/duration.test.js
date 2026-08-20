import { describe, expect, it } from 'vitest'
import { formatClock, formatDuration, parseDuration } from '../duration.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('parseDuration', () => {
  it('parses plain phrases', () => {
    expect(parseDuration('5 minutes')).toBe(5 * MINUTE)
    expect(parseDuration('90 seconds')).toBe(90_000)
    expect(parseDuration('2 days')).toBe(2 * 24 * HOUR)
  })

  it('parses compact and compound forms', () => {
    expect(parseDuration('1h30m')).toBe(HOUR + 30 * MINUTE)
    expect(parseDuration('2 hours and 15 minutes')).toBe(2 * HOUR + 15 * MINUTE)
    expect(parseDuration('1 day 2 hours')).toBe(24 * HOUR + 2 * HOUR)
  })

  it('parses spoken numbers', () => {
    expect(parseDuration('ten minutes')).toBe(10 * MINUTE)
    expect(parseDuration('a minute')).toBe(MINUTE)
    expect(parseDuration('forty five seconds')).toBe(45_000)
    expect(parseDuration('forty-five seconds')).toBe(45_000)
  })

  it('parses halves', () => {
    expect(parseDuration('half an hour')).toBe(30 * MINUTE)
    expect(parseDuration('an hour and a half')).toBe(90 * MINUTE)
  })

  it('does not read "and" as "an" + "d" (a day)', () => {
    expect(parseDuration('2 hours and 15 minutes')).toBeLessThan(3 * HOUR)
  })

  it('returns null when there is no duration', () => {
    expect(parseDuration('tomorrow')).toBeNull()
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('pasta')).toBeNull()
  })
})

describe('formatDuration', () => {
  it('renders the two most significant units', () => {
    expect(formatDuration(90_000)).toBe('1 minute 30 seconds')
    expect(formatDuration(HOUR)).toBe('1 hour')
    expect(formatDuration(0)).toBe('0 seconds')
  })
})

describe('formatClock', () => {
  it('renders a countdown', () => {
    expect(formatClock(90_000)).toBe('01:30')
    expect(formatClock(HOUR)).toBe('1:00:00')
    expect(formatClock(-5000)).toBe('00:00')
  })
})
