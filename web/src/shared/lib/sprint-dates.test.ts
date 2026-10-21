import { describe, expect, it } from 'vitest'
import {
  formatRange,
  instantToZonedWallTime,
  timeLeft,
  zonedWallTimeToInstant,
} from './sprint-dates'

const at = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 9, day, hours, minutes).toISOString()

describe('sprint ranges', () => {
  it('shows dates only for whole days', () => {
    expect(formatRange(at(1, 0), at(14, 23, 59))).toBe('Oct 1 – Oct 14')
    expect(formatRange(at(16, 0), at(16, 23, 59))).toBe('Oct 16')
  })

  it("names the browser's zone for one this browser does not know", () => {
    expect(formatRange(at(16, 9), at(16, 22), 'h23', 'Mars/Olympus')).toBe(
      'Oct 16, 09:00 – 22:00 EDT'
    )
  })

  it('shows the times and the zone otherwise, in the hour cycle of the locale', () => {
    expect(formatRange(at(16, 9), at(16, 22), 'h23')).toBe(
      'Oct 16, 09:00 – 22:00 EDT'
    )
    expect(formatRange(at(16, 9), at(16, 22), 'h12')).toBe(
      'Oct 16, 9:00 AM – 10:00 PM EDT'
    )
    expect(formatRange(at(16, 9), at(17, 22), 'h23')).toBe(
      'Oct 16, 09:00 – Oct 17, 22:00 EDT'
    )
    expect(formatRange(at(16, 9), at(16, 22))).toBe(
      'Oct 16, 9:00 AM – 10:00 PM EDT'
    )
  })

  it("reads days and times in the account's zone when given one", () => {
    const auckland = 'Pacific/Auckland'
    expect(
      formatRange(
        '2026-09-30T11:00:00Z',
        '2026-10-14T10:59:00Z',
        'h23',
        auckland
      )
    ).toBe('Oct 1 – Oct 14')
    expect(formatRange(at(16, 9), at(16, 22), 'h23', auckland)).toBe(
      'Oct 17, 02:00 – 15:00 GMT+13'
    )
  })
})

describe('time left', () => {
  const end = at(16, 22)
  const before = (minutes: number, seconds = 0) =>
    Date.parse(end) - minutes * 60_000 - seconds * 1000

  it.each([
    [before(3 * 1440 + 120), '3 days left'],
    [before(1440), '1 day left'],
    [before(320), '5h 20m left'],
    [before(300), '5h left'],
    [before(20), '20m left'],
    [before(0, 30), '1m left'],
  ])('counts down: %d', (now, text) => {
    expect(timeLeft(now, end)).toEqual({ overdue: false, text })
  })

  it.each([
    [before(0), 'Overdue'],
    [before(-20), 'Overdue by 20m'],
    [before(-125), 'Overdue by 2h'],
    [before(-1440), 'Overdue by 1 day'],
    [before(-3 * 1440), 'Overdue by 3 days'],
  ])('turns overdue at the end: %d', (now, text) => {
    expect(timeLeft(now, end)).toEqual({ overdue: true, text })
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
