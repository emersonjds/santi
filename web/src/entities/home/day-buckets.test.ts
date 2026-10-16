import { describe, expect, it } from 'vitest'
import { dayBucket, groupByDay } from './day-buckets'

const at = (day: string, time = '12:00') => new Date(`${day}T${time}`)

describe('day buckets', () => {
  it('sorts a midweek day into today, yesterday, this week, this month and older', () => {
    const now = at('2026-10-14', '10:00') // a Wednesday

    expect(dayBucket(at('2026-10-14', '00:01').toISOString(), now)).toBe(
      'Today'
    )
    expect(dayBucket(at('2026-10-13', '23:59').toISOString(), now)).toBe(
      'Yesterday'
    )
    expect(dayBucket(at('2026-10-12', '00:00').toISOString(), now)).toBe(
      'This week'
    )
    expect(dayBucket(at('2026-10-11').toISOString(), now)).toBe('This month')
    expect(dayBucket(at('2026-10-01', '00:00').toISOString(), now)).toBe(
      'This month'
    )
    expect(dayBucket(at('2026-09-30', '23:59').toISOString(), now)).toBe(
      'Older'
    )
  })

  it('lets the week win over a month that just turned', () => {
    const now = at('2026-10-01') // a Thursday

    expect(dayBucket(at('2026-09-30').toISOString(), now)).toBe('Yesterday')
    expect(dayBucket(at('2026-09-28').toISOString(), now)).toBe('This week')
    expect(dayBucket(at('2026-09-27').toISOString(), now)).toBe('Older')
  })

  it('treats Sunday as the end of the week', () => {
    const now = at('2026-10-18') // a Sunday

    expect(dayBucket(at('2026-10-12').toISOString(), now)).toBe('This week')
    expect(dayBucket(at('2026-10-11').toISOString(), now)).toBe('This month')
  })

  it('groups rows in order, skipping empty buckets', () => {
    const now = at('2026-10-14', '10:00')
    const rows = [
      { key: 'A', at: at('2026-10-14').toISOString() },
      { key: 'B', at: at('2026-10-14', '08:00').toISOString() },
      { key: 'C', at: at('2026-01-02').toISOString() },
    ]

    expect(groupByDay(rows, now)).toEqual([
      { bucket: 'Today', items: [rows[0], rows[1]] },
      { bucket: 'Older', items: [rows[2]] },
    ])
  })
})
