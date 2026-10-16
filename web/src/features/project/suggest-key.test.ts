import { describe, expect, it } from 'vitest'
import { suggestKey } from './suggest-key'

describe('suggested project key', () => {
  it('takes the first three letters of a single word', () => {
    expect(suggestKey('website')).toBe('WEB')
  })

  it('takes the initials of several words, at most ten', () => {
    expect(suggestKey('Mobile app redesign')).toBe('MAR')
    expect(suggestKey('a b c d e f g h i j k l')).toBe('ABCDEFGHIJ')
  })

  it('skips words that cannot start a key', () => {
    expect(suggestKey('2026 roadmap')).toBe('ROA')
    expect(suggestKey('  ')).toBe('')
  })
})
