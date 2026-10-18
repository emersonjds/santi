import { describe, expect, it } from 'vitest'
import { mentionToken, mentionUserId, parseMention } from './mention'

describe('mention token', () => {
  it('writes a Markdown link with the brackets of the name escaped', () => {
    expect(mentionToken({ user_id: 42, display_name: 'Ana [QA]' })).toBe(
      '[@Ana \\[QA\\]](mention:42)'
    )
    expect(mentionToken({ user_id: 7, display_name: 'C:\\dev' })).toBe(
      '[@C:\\\\dev](mention:7)'
    )
  })

  it('reads the id and the captured name back', () => {
    const name = 'Ana [QA] \\ Souza'
    expect(
      parseMention(mentionToken({ user_id: 42, display_name: name }))
    ).toEqual({ userId: 42, name })
  })

  it('refuses tokens that are not a mention of a numeric id', () => {
    expect(parseMention('[@Ana](mention:abc)')).toBeNull()
    expect(parseMention('[@Ana](mention:)')).toBeNull()
    expect(parseMention('[Ana](https://example.com)')).toBeNull()
    expect(parseMention('[@Ana [QA]](mention:42)')).toBeNull()
  })

  it('reads the user id from a mention URL only', () => {
    expect(mentionUserId('mention:42')).toBe(42)
    expect(mentionUserId('mention:4x')).toBeNull()
    expect(mentionUserId('https://example.com/mention:42')).toBeNull()
  })
})
