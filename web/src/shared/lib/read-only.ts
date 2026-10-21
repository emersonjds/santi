import { type MouseEvent, createContext, use } from 'react'

/** SAN-70 Q3: inside, write controls stay focusable but inert; the value is the id of the text saying why. */
export const ReadOnly = createContext<string | undefined>(undefined)

export const useReadOnly = () => use(ReadOnly)

const describedBy = (note: string, own: string | undefined) =>
  own ? `${own} ${note}` : note

/** The look of a control `lockedButton` locks. */
export const LOCKED =
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

/** A button that stays in place and in the tab order, does nothing, and points at the reason. */
export const lockedButton = (note: string | undefined, own?: string) =>
  note
    ? {
        'aria-disabled': true,
        'aria-describedby': describedBy(note, own),
        // Capture runs before the handlers Slot merges in from an `asChild` child.
        onClickCapture: (event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
        },
      }
    : {}

/** Controlled selects only: React puts the value back when onChange does not take it. */
export const lockedSelect = (note: string | undefined, own?: string) =>
  note
    ? {
        'aria-disabled': true,
        'aria-describedby': describedBy(note, own),
        onChange: () => {},
      }
    : {}

export const lockedField = (note: string | undefined, own?: string) =>
  note ? { readOnly: true, 'aria-describedby': describedBy(note, own) } : {}
