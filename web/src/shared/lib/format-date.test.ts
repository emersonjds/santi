import { describe, expect, it } from 'vitest'
import { formatDate } from './format-date'

const NOON_UTC = '2026-10-01T12:00:00Z'

describe('formatDate', () => {
  it("uses the browser's zone without one", () => {
    expect(formatDate(NOON_UTC, { dateStyle: 'medium' })).toBe('Oct 1, 2026')
  })

  it('uses the given zone, where it may already be the next day', () => {
    expect(
      formatDate(
        new Date(NOON_UTC),
        { dateStyle: 'medium' },
        'Pacific/Auckland'
      )
    ).toBe('Oct 2, 2026')
  })

  it("falls back to the browser's zone for one this browser does not know", () => {
    expect(formatDate(NOON_UTC, { dateStyle: 'medium' }, 'Mars/Olympus')).toBe(
      'Oct 1, 2026'
    )
  })

  it('takes a locale', () => {
    expect(formatDate(NOON_UTC, { dateStyle: 'medium' }, 'UTC', 'pt-BR')).toBe(
      '1 de out. de 2026'
    )
  })
})
