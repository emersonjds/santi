import { describe, expect, it } from 'vitest'
import { formatPoints, parseReportSearch } from './report-queries'

describe('report helpers', () => {
  it('shows a dash for a missing total, never 0', () => {
    expect(formatPoints(null)).toBe('—')
    expect(formatPoints(undefined)).toBe('—')
  })

  it('keeps 0 and decimals', () => {
    expect(formatPoints(0)).toBe('0')
    expect(formatPoints(2.5)).toBe('2.5')
  })

  it('keeps a valid issue number only', () => {
    expect(parseReportSearch({ issue: 7, q: 'x' })).toEqual({ issue: 7 })
    expect(parseReportSearch({ issue: 'x' })).toEqual({})
    expect(parseReportSearch({ issue: 0 })).toEqual({})
  })
})
