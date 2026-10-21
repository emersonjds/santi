import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readStoredTheme } from './theme'

const prefersDark = (matches: boolean) =>
  vi.stubGlobal('matchMedia', () => ({ matches }))

const themeColor = () =>
  document.querySelector('meta[name=theme-color]')?.getAttribute('content')

describe('theme', () => {
  afterEach(() => applyTheme('system'))

  it('applies an explicit choice and remembers it', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)

    applyTheme('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(themeColor()).toBe('#0f0f0e')
    expect(readStoredTheme()).toBe('dark')

    applyTheme('light')

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(themeColor()).toBe('#ffffff')
    meta.remove()
  })

  it('follows the system preference for system', () => {
    prefersDark(true)
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('dark')

    prefersDark(false)
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(readStoredTheme()).toBe('system')
  })

  it('falls back to system when storage is unusable or holds junk', () => {
    localStorage.setItem('santi-theme', 'blue')
    expect(readStoredTheme()).toBe('system')

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredTheme()).toBe('system')
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    vi.restoreAllMocks()
  })
})
