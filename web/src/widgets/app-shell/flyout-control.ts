import { type RefObject, createContext } from 'react'

/** What a flyout body needs from its sidebar entry: closing itself and the trigger to focus after. */
export const FlyoutControl = createContext<{
  close: () => void
  trigger: RefObject<HTMLButtonElement | null>
}>({ close: () => undefined, trigger: { current: null } })
