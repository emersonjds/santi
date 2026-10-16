import { Circle, CircleCheck, CircleDot } from 'lucide-react'
import type { BoardSettings } from '@/shared/api/client'

export type Status = BoardSettings['columns'][number]['statuses'][number]
export type Category = Status['category']

// D36: glyph and text, color second.
export const CATEGORY = {
  todo: {
    icon: Circle,
    label: 'to do',
    tone: 'bg-status-todo-bg text-status-todo',
  },
  in_progress: {
    icon: CircleDot,
    label: 'in progress',
    tone: 'bg-status-progress-bg text-status-progress',
  },
  done: {
    icon: CircleCheck,
    label: 'done',
    tone: 'bg-status-done-bg text-status-done',
  },
} satisfies Record<Category, unknown>

/** Every mapped status of the board by id. */
export const statusesById = (settings: BoardSettings | undefined) =>
  new Map(
    (settings?.columns ?? []).flatMap((column) =>
      column.statuses.map((status) => [status.id, status] as const)
    )
  )
