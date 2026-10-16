import { describe, expect, it } from 'vitest'
import { parseRedirect } from './require-session'

describe('sign-in redirect', () => {
  it.each(['/', '/p/WEB/board?epic=WEB-9#top', '/p/WEB/issues/1'])(
    'keeps the same-site path %s',
    (path) => {
      expect(parseRedirect({ redirect: path })).toEqual({ redirect: path })
    }
  )

  it.each([
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/p/WEB\u0000',
    'https://evil.example/',
    'javascript:alert(1)',
    'p/WEB/board',
  ])('drops %j', (path) => {
    expect(parseRedirect({ redirect: path })).toEqual({ redirect: undefined })
  })

  it('drops anything but a string', () => {
    expect(parseRedirect({ redirect: ['/'] })).toEqual({ redirect: undefined })
  })
})
