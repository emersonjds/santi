import { useEffect, useEffectEvent } from 'react'

const OFF = 'santi.shortcuts.off'

/** UI-37: one switch per viewer, kept in this browser. */
export const shortcutsOn = () => {
  try {
    return localStorage.getItem(OFF) === null
  } catch {
    return true
  }
}

export const setShortcutsOn = (on: boolean) => {
  try {
    if (on) localStorage.removeItem(OFF)
    else localStorage.setItem(OFF, '1')
  } catch {
    // Storage blocked: the switch lasts until the reload.
  }
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

// The issue dialog keeps the shortcuts; a menu, a popover or any other dialog owns the keys.
const OTHER_LAYER =
  '[role=dialog]:not([data-issue-dialog]), [role=alertdialog], [role=menu], [role=listbox]'

const isShortcut = (event: KeyboardEvent) =>
  !event.defaultPrevented &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  !isTyping(event.target) &&
  !document.querySelector(OTHER_LAYER) &&
  shortcutsOn()

/** Calls `onKey` for a plain key press meant as a shortcut; it calls `preventDefault` on the keys it takes. */
export const useShortcuts = (onKey: (event: KeyboardEvent) => void) => {
  const handle = useEffectEvent(onKey)
  useEffect(() => {
    const listen = (event: KeyboardEvent) => {
      if (isShortcut(event)) handle(event)
    }
    document.addEventListener('keydown', listen)
    return () => document.removeEventListener('keydown', listen)
  }, [])
}

/** The issue links of the page under any dialog, in reading order: board columns left to right, backlog sections top down. */
// ponytail: DOM order only; a virtualized backlog (> 200 rows) draws the next rows as the focus scrolls, so j reaches them one window at a time.
export const issueLinks = () =>
  [...document.querySelectorAll<HTMLElement>('main [data-issue-key]')].filter(
    (link) => link.checkVisibility()
  )

export const focusedIssueKey = () =>
  document.activeElement instanceof HTMLElement
    ? document.activeElement.dataset.issueKey
    : undefined
