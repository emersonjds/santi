import { useDndContext } from '@dnd-kit/core'

export const COLUMN = 'column:'
export const ZONE = 'zone:'
export const STATUS = 'status:'
export const UNMAPPED = 'unmapped'

/** While one kind is held, the other kind's targets step aside: columns sort among columns, chips land on zones. */
export const useHeld = (prefix: string) =>
  String(useDndContext().active?.id ?? '').startsWith(prefix)
