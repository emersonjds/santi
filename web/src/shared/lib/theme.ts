import type { User } from '@/shared/api/client'

export type Theme = User['theme']

// Same key and colours as public/theme.js, which applies the theme before first paint.
const KEY = 'santi-theme'
const BAR = { light: '#ffffff', dark: '#0f0f0e' }

const isTheme = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark' || value === 'system'

export const readStoredTheme = (): Theme => {
  try {
    const value = localStorage.getItem(KEY)
    return isTheme(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export const applyTheme = (choice: Theme) => {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // the choice lasts until the reload
  }
  const resolved =
    choice === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : choice
  document.documentElement.dataset.theme = resolved
  document
    .querySelector('meta[name=theme-color]')
    ?.setAttribute('content', BAR[resolved])
}
