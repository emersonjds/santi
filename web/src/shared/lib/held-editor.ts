import {
  type ChangeEvent,
  createContext,
  use,
  useMemo,
  useSyncExternalStore,
} from 'react'

/** Kept above a drag layer swap, which remounts every row and column: an open editor and its draft survive it. */
export const createHeldEditors = () => {
  let open: string | null = null
  let draft = ''
  let mountedFields = 0
  const listeners = new Set<() => void>()
  const setOpen = (id: string | null) => {
    open = id
    for (const listener of listeners) listener()
  }
  const stop = (id: string) => {
    if (open === id) setOpen(null)
  }
  return {
    stop,
    start: (id: string, value: string) => {
      draft = value
      setOpen(id)
    },
    isOpen: (id: string) => open === id,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    keepDraft: (value: string) => {
      draft = value
    },
    // At commit, not render: the drag layer renders concurrently while the user types.
    mountField: (id: string, input: HTMLInputElement) => {
      input.value = draft
      mountedFields += 1
      return () => {
        mountedFields -= 1
        // The drag layer swap unmounts the field and mounts its twin in the same commit.
        queueMicrotask(() => {
          if (mountedFields === 0) stop(id)
        })
      }
    },
  }
}

export const HeldEditors = createContext<ReturnType<
  typeof createHeldEditors
> | null>(null)

/** One text field opened in place; `field` goes on its input. */
export const useHeldEditor = (id: string) => {
  const editors = use(HeldEditors)
  if (!editors) throw new Error('useHeldEditor needs HeldEditors provided')
  const editing = useSyncExternalStore(editors.subscribe, () =>
    editors.isOpen(id)
  )
  const actions = useMemo(
    () => ({
      start: (value: string) => editors.start(id, value),
      stop: () => editors.stop(id),
      field: {
        autoFocus: true,
        ref: (input: HTMLInputElement) => editors.mountField(id, input),
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          editors.keepDraft(event.currentTarget.value),
      },
    }),
    [editors, id]
  )
  return { editing, ...actions }
}
