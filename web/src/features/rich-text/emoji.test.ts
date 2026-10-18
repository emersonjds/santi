import { describe, expect, it } from 'vitest'
import { emojiNamed, emojiStartingWith } from './emoji'

describe('emoji', () => {
  it('finds an emoji by its whole name', () => {
    expect(emojiNamed('smile')).toBe('😄')
    expect(emojiNamed('+1')).toBe('👍')
    expect(emojiNamed('nope')).toBeUndefined()
  })

  it('lists the emoji whose name starts with the text, or a word of it does', () => {
    const names = emojiStartingWith('smi').map(([name]) => name)
    expect(names).toContain('smile')
    expect(names).toContain('smirk')
    expect(names.every((name) => /(^|_)smi/.test(name))).toBe(true)
    expect(emojiStartingWith('eyes').map(([name]) => name)).toContain(
      'heart_eyes'
    )
    expect(emojiStartingWith('zzzzz')).toEqual([])
  })
})
