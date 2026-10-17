import {
  type ChangeEvent,
  createContext,
  use,
  useMemo,
  useSyncExternalStore,
} from 'react'

type HeldField = HTMLInputElement | HTMLSelectElement

/** Kept above a drag layer swap, which remounts every row and column: open editors and their drafts survive it. */
export const createHeldEditors = () => {
  const open = new Set<string>()
  const drafts = new Map<string, string>()
  const fields = new Map<string, HeldField>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const stop = (id: string) => {
    if (open.delete(id)) notify()
  }
  return {
    stop,
    start: (id: string, value: string) => {
      drafts.set(id, value)
      open.add(id)
      notify()
    },
    isOpen: (id: string) => open.has(id),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    keepDraft: (id: string, value: string) => {
      drafts.set(id, value)
    },
    fill: (id: string, value: string) => {
      drafts.set(id, value)
      const field = fields.get(id)
      if (field) field.value = value
    },
    // At commit, not render: the drag layer renders concurrently while the user types.
    mountField: (id: string, field: HeldField) => {
      const draft = drafts.get(id)
      if (draft !== undefined) field.value = draft
      fields.set(id, field)
      return () => {
        if (fields.get(id) === field) fields.delete(id)
        // The drag layer swap unmounts the field and mounts its twin in the same commit.
        queueMicrotask(() => {
          if (fields.has(id)) return
          drafts.delete(id)
          stop(id)
        })
      }
    },
  }
}

export const HeldEditors = createContext<ReturnType<
  typeof createHeldEditors
> | null>(null)

/** One field opened in place, or a form field held by id; `field` goes on its input. */
export const useHeldEditor = <Field extends HeldField = HTMLInputElement>(
  id: string
) => {
  const editors = use(HeldEditors)
  if (!editors) throw new Error('useHeldEditor needs HeldEditors provided')
  const editing = useSyncExternalStore(editors.subscribe, () =>
    editors.isOpen(id)
  )
  const actions = useMemo(
    () => ({
      start: (value: string) => editors.start(id, value),
      stop: () => editors.stop(id),
      fill: (value: string) => editors.fill(id, value),
      field: {
        autoFocus: true,
        ref: (field: Field) => editors.mountField(id, field),
        onChange: (event: ChangeEvent<Field>) =>
          editors.keepDraft(id, event.currentTarget.value),
      },
    }),
    [editors, id]
  )
  return { editing, ...actions }
}
