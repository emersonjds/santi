import { useState } from 'react'

/** Radix gives the focus back only to a `DialogTrigger`; a dialog opened by state (a menu item, a key) gives it back to whatever held it when it opened. Pass the result as `onCloseAutoFocus`. */
export const useReturnFocus = () => {
  const [opener] = useState(() => document.activeElement)
  return (event: Event) => {
    if (!(opener instanceof HTMLElement) || !opener.isConnected) return
    event.preventDefault()
    opener.focus()
  }
}
