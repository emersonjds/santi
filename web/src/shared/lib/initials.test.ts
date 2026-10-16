import { describe, expect, it } from 'vitest'
import { avatarTone, initials } from './initials'

describe('avatars without a picture', () => {
  it('takes at most two initials', () => {
    expect(initials('Ada  Byron Lovelace')).toBe('AB')
  })

  it('gives a name the same tone every time, and different people different tones', () => {
    expect(avatarTone('Grace Hopper')).toBe(avatarTone('Grace Hopper'))
    const tones = new Set(
      [
        'Ada Lovelace',
        'Grace Hopper',
        'Linus Okafor',
        'Margaret Chen',
        'Alan Ribeiro',
      ].map(avatarTone)
    )
    expect(tones.size).toBeGreaterThanOrEqual(4)
    expect(
      [...tones].every((tone) =>
        /^bg-avatar-\d text-avatar-\d-foreground$/.test(tone)
      )
    ).toBe(true)
  })
})
