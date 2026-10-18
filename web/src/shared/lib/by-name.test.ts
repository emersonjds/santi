import { describe, expect, it } from 'vitest'
import { pickByName } from './by-name'
import { avatarTone } from './initials'

const CHOICES = ['a', 'b', 'c']

describe('picking by name', () => {
  it('gives a name the same choice every time, always one of the list', () => {
    expect(pickByName('Grace Hopper', CHOICES)).toBe(
      pickByName('Grace Hopper', CHOICES)
    )
    for (const name of ['', 'x', 'Ada Lovelace', 'label-7999'])
      expect(CHOICES).toContain(pickByName(name, CHOICES))
  })

  it('keeps every avatar tone it had before the hash moved', () => {
    expect(
      [
        'Ada Lovelace',
        'Grace Hopper',
        'Linus Okafor',
        'Margaret Chen',
        'Alan Ribeiro',
      ].map(avatarTone)
    ).toEqual([
      'bg-avatar-2 text-avatar-2-foreground',
      'bg-avatar-1 text-avatar-1-foreground',
      'bg-avatar-4 text-avatar-4-foreground',
      'bg-avatar-6 text-avatar-6-foreground',
      'bg-avatar-2 text-avatar-2-foreground',
    ])
  })
})
