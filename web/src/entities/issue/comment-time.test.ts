import { describe, expect, it } from 'vitest'
import { commentTime, fullDateTime } from './comment-time'

const NOW = new Date(2026, 9, 18, 12, 0).getTime()
const at = (...parts: [number, number, number, number, number]) =>
  new Date(...parts).toISOString()

describe('comment time', () => {
  it('is relative under 7 days', () => {
    expect(commentTime(at(2026, 9, 18, 10, 0), NOW)).toBe('2 hours ago')
    expect(commentTime(at(2026, 9, 12, 12, 0), NOW)).toBe('6 days ago')
  })

  it('is the date from 7 days on, with the year only when not this one', () => {
    expect(commentTime(at(2026, 9, 11, 12, 0), NOW)).toBe('Oct 11')
    expect(commentTime(at(2026, 0, 3, 9, 0), NOW)).toBe('Jan 3')
    expect(commentTime(at(2025, 11, 30, 9, 0), NOW)).toBe('Dec 30, 2025')
  })

  it('spells out the date and time for the hover', () => {
    expect(fullDateTime(at(2026, 9, 3, 14, 5))).toMatch(
      /^Oct 3, 2026, 2:05\sPM$/
    )
  })
})
