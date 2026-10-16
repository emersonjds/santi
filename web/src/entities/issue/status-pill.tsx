import { Circle, CircleCheck, CircleDot } from 'lucide-react'
import type { BoardSettings } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'

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

export const StatusPill = ({ status }: { status: Status }) => {
  const { icon: Icon, tone } = CATEGORY[status.category]
  return (
    <span
      className={cn(
        'inline-flex max-w-32 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        tone
      )}
    >
      <Icon className='size-3.5 shrink-0' aria-hidden='true' />
      <span className='truncate'>{status.name}</span>
    </span>
  )
}
