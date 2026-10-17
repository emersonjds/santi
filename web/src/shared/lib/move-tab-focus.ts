import type { KeyboardEvent } from 'react'

/** WAI-ARIA tabs: arrow keys, Home and End move between tabs; Space opens the focused one. */
export const moveTabFocus = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key === ' ' && event.target instanceof HTMLElement) {
    event.preventDefault()
    event.target.click()
    return
  }
  const tabs = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role=tab]'),
  ]
  const current = tabs.findIndex((tab) => tab === document.activeElement)
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : step === undefined
          ? -1
          : (current + step + tabs.length) % tabs.length
  if (next < 0) return
  event.preventDefault()
  tabs[next].focus()
}
