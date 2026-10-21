import { describe, expect, it } from 'vitest'
import { zoneName } from '@/shared/lib/sprint-dates'
import {
  PRESETS,
  customLength,
  fromInputs,
  sprintWindow,
} from './sprint-window'

// The browser runs in America/New_York (vite.config.ts).
const at = (
  month: number,
  date: number,
  hours = 18,
  minutes = 0,
  year = 2026
) => new Date(year, month - 1, date, hours, minutes)

describe('sprint window', () => {
  it('lists the presets in order', () => {
    expect(PRESETS.map(([, label]) => label)).toEqual([
      '4 hours',
      '1 day',
      '1 week',
      '2 weeks',
      '1 month',
    ])
  })

  it.each([
    ['4h', at(10, 16), at(10, 16, 22)],
    ['1d', at(10, 16), at(10, 16, 23, 59)],
    ['1d', at(10, 16, 23, 59), at(10, 16, 23, 59)],
    ['1w', at(10, 28), at(11, 4)],
    ['2w', at(10, 30), at(11, 13)],
    ['1m', at(10, 16), at(11, 16)],
    ['1m', at(1, 31, 18, 0, 2027), at(2, 28, 18, 0, 2027)],
    ['90', at(10, 16), at(10, 16, 19, 30)],
  ])('%s from %o ends at %o', (length, start, end) => {
    expect(sprintWindow(start, length)).toEqual(end)
  })

  it('keeps the wall clock across the end of daylight time', () => {
    expect(sprintWindow(at(10, 28), '1w').getHours()).toBe(18)
    expect(sprintWindow(at(10, 30), '2w').getHours()).toBe(18)
  })

  it.each([
    ['1d', '2026-10-21T20:00:00Z', '2026-10-22T10:59:00.000Z'],
    ['1w', '2026-03-31T20:00:00Z', '2026-04-07T21:00:00.000Z'],
    ['1m', '2027-01-30T20:00:00Z', '2027-02-27T20:00:00.000Z'],
  ])('%s from %s ends at %s in Auckland', (length, start, end) => {
    expect(
      sprintWindow(new Date(start), length, 'Pacific/Auckland').toISOString()
    ).toBe(end)
  })

  it('reads a custom length in minutes, refusing an empty or huge one', () => {
    expect(customLength(at(10, 16), at(10, 16, 19, 30))).toBe('90')
    expect(customLength(at(10, 16), at(10, 16))).toBeNull()
    expect(customLength(at(10, 16), new Date(2046, 0, 1))).toBeNull()
  })

  it('joins the inputs into an instant, filling an empty time', () => {
    const instant = at(10, 16, 9, 5)
    expect(fromInputs('2026-10-16', '09:05', '00:00')).toEqual(instant)
    expect(fromInputs('2026-10-16', '', '00:00')).toEqual(at(10, 16, 0))
    expect(fromInputs('2026-10-16', '', '23:59')).toEqual(at(10, 16, 23, 59))
    expect(
      fromInputs('2026-10-21', '', '23:59', 'Pacific/Auckland').toISOString()
    ).toBe('2026-10-21T10:59:00.000Z')
  })

  it('names the zone', () => {
    expect(zoneName(new Date(2026, 9, 16))).toBe('EDT')
    expect(zoneName(new Date(2026, 11, 16))).toBe('EST')
  })
})
