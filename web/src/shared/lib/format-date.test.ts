import { describe, expect, it } from 'vitest'
import {
  formatDate,
  instantToZonedWallTime,
  zonedWallTimeToInstant,
} from './format-date'

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

describe('zoned wall time', () => {
  it.each([
    ['2026-10-21', '09:00', 'Pacific/Auckland', '2026-10-20T20:00:00.000Z'],
    ['2026-03-29', '01:30', 'Europe/Berlin', '2026-03-29T00:30:00.000Z'],
    ['2026-03-29', '03:30', 'Europe/Berlin', '2026-03-29T01:30:00.000Z'],
    ['2026-04-05', '01:00', 'Pacific/Auckland', '2026-04-04T12:00:00.000Z'],
    ['2026-04-05', '09:00', 'Pacific/Auckland', '2026-04-04T21:00:00.000Z'],
    ['2026-10-16', '09:05', undefined, '2026-10-16T13:05:00.000Z'],
  ])('%s %s in %s is %s and back', (day, time, zone, instant) => {
    expect(zonedWallTimeToInstant(day, time, zone).toISOString()).toBe(instant)
    expect(instantToZonedWallTime(new Date(instant), zone)).toEqual({
      day,
      time,
    })
  })

  it('moves a time the clocks skip forward by the gap', () => {
    expect(
      zonedWallTimeToInstant('2026-03-29', '02:30', 'Europe/Berlin')
    ).toEqual(new Date('2026-03-29T01:30:00Z'))
  })

  it('reads midnight as 00:00', () => {
    expect(
      instantToZonedWallTime(
        new Date('2026-10-20T11:00:00Z'),
        'Pacific/Auckland'
      )
    ).toEqual({ day: '2026-10-21', time: '00:00' })
  })
})
