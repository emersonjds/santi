import { type MouseEvent, createContext, use } from 'react'

/** SAN-70 Q3: inside, write controls stay focusable but inert; the value is the id of the text saying why. */
export const ReadOnly = createContext<string | undefined>(undefined)

export const useReadOnly = () => use(ReadOnly)

/** A button that stays in place and in the tab order, does nothing, and points at the reason. */
export const lockedButton = (note: string | undefined) =>
  note
    ? {
        'aria-disabled': true,
        'aria-describedby': note,
        onClick: (event: MouseEvent) => event.preventDefault(),
      }
    : {}

/** A native select keeps its value: React puts a controlled value back when onChange does not take it. */
export const lockedSelect = (note: string | undefined) =>
  note
    ? { 'aria-disabled': true, 'aria-describedby': note, onChange: () => {} }
    : {}

export const lockedField = (note: string | undefined) =>
  note ? { readOnly: true, 'aria-describedby': note } : {}
