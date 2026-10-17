import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  createContext,
  use,
  useMemo,
  useRef,
  useState,
} from 'react'

type Editors = {
  open: string | null
  setOpen: Dispatch<SetStateAction<string | null>>
  draft: { current: string }
  restoreDraft: (input: HTMLInputElement | null) => void
}

/** Provided above a drag layer swap, which remounts every row and column: an open editor and its draft survive it. */
export const HeldEditors = createContext<Editors | null>(null)

export const useHeldEditors = (): Editors => {
  const [open, setOpen] = useState<string | null>(null)
  const draft = useRef('')
  return useMemo(
    () => ({
      open,
      setOpen,
      draft,
      // At commit, not render: the drag layer renders concurrently while the user types.
      restoreDraft: (input: HTMLInputElement | null) => {
        if (input) input.value = draft.current
      },
    }),
    [open]
  )
}

/** One text field opened in place; `field` goes on its input. */
export const useHeldEditor = (id: string) => {
  const editors = use(HeldEditors)
  if (!editors) throw new Error('useHeldEditor needs HeldEditors provided')
  const { open, setOpen, draft, restoreDraft } = editors
  return {
    editing: open === id,
    start: (value: string) => {
      draft.current = value
      setOpen(id)
    },
    stop: () => setOpen((current) => (current === id ? null : current)),
    field: {
      autoFocus: true,
      ref: restoreDraft,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        draft.current = event.currentTarget.value
      },
    },
  }
}
