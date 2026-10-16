import { describe, expect, it } from 'vitest'
import { avatarTone, fullName, initials, shortName } from './initials'

describe('avatars without a picture', () => {
  it('takes the first and last initials', () => {
    expect(initials('Ada  Byron Lovelace')).toBe('AL')
    expect(initials('EMERSON JUNIOR DANIEL SILVA')).toBe('ES')
    expect(initials('Alice')).toBe('A')
    expect(initials('  ')).toBe('')
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

describe('people on one line', () => {
  it.each([
    ['Alice', 'Alice'],
    ['Bob Stone', 'Bob Stone'],
    ['Emerson Junior Daniel Silva', 'Emerson Silva'],
    ['EMERSON JUNIOR DANIEL SILVA', 'Emerson Silva'],
    ['  Bob   Stone  ', 'Bob Stone'],
    ['Ana McDonald da Silva', 'Ana Silva'],
    ['JOÃO ÁVILA', 'João Ávila'],
    ['CAÇA ÇARAN', 'Caça Çaran'],
    ['', ''],
  ])('shortens %j to %j', (name, short) => {
    expect(shortName(name)).toBe(short)
  })

  it('title-cases the full name only when it is all capitals', () => {
    expect(fullName('EMERSON  JUNIOR DANIEL SILVA ')).toBe(
      'Emerson Junior Daniel Silva'
    )
    expect(fullName('MARIA-JOSÉ D’ÁVILA')).toBe('Maria-José D’Ávila')
    expect(fullName('Ana McDonald da Silva')).toBe('Ana McDonald da Silva')
    expect(fullName('42')).toBe('42')
  })
})
