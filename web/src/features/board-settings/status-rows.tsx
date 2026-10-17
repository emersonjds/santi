import { useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Plus, Trash2 } from 'lucide-react'
import { StatusPill } from '@/entities/issue/status-pill'
import {
  CATEGORY,
  type Category,
  type Status,
  isCategory,
} from '@/entities/issue/statuses'
import { useReadOnly } from '@/shared/lib/read-only'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { CommitInput } from '@/shared/ui/commit-input'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { COLUMN, STATUS, ZONE, useHeld } from './drag-kinds'
import { type Column, type OnEdit, isPending } from './settings-edits'

export const ICON = 'size-11 md:size-9'

/** Not focusable, so pointer drag only: the keyboard (and a phone) maps a status with its column select. */
const StatusChip = ({ status }: { status: Status }) => {
  const locked = useReadOnly() !== undefined
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${STATUS}${status.id}`,
    disabled: locked || isPending(status),
  })
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      className={cn(
        'rounded-full',
        !locked && 'cursor-grab',
        isDragging && 'relative z-10 cursor-grabbing shadow-lg'
      )}
    >
      <StatusPill status={status} />
    </li>
  )
}

export const StatusZone = ({
  id,
  label,
  statuses,
}: {
  id: string
  label: string
  statuses: Status[]
}) => {
  const columnHeld = useHeld(COLUMN)
  const { setNodeRef, isOver } = useDroppable({
    id: `${ZONE}${id}`,
    disabled: columnHeld,
  })
  return (
    <ul
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        'flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-dashed p-1.5',
        isOver && 'border-primary bg-accent'
      )}
    >
      {statuses.map((status) => (
        <StatusChip key={status.id} status={status} />
      ))}
      {statuses.length === 0 && (
        <li className='px-1 text-xs text-subtle-foreground'>
          No status here yet
        </li>
      )}
    </ul>
  )
}
export const StatusRow = ({
  status,
  columns,
  onEdit,
}: {
  status: Status
  columns: Column[]
  onEdit: OnEdit
}) => {
  const { icon: Icon, label } = CATEGORY[status.category]
  const pending = isPending(status)
  const columnId = status.column_id ?? null
  return (
    <li className='flex flex-wrap items-center gap-2 bg-card px-3 py-2'>
      <CommitInput
        aria-label={`Name of status ${status.name}`}
        value={status.name}
        required
        maxLength={60}
        disabled={pending}
        className='h-11 min-w-40 flex-1 md:h-9'
        onCommit={(name) =>
          onEdit({ kind: 'update-status', status, name, column_id: columnId })
        }
      />
      <span className='inline-flex w-28 items-center gap-1 text-sm text-muted-foreground'>
        <Icon className='size-4 shrink-0' aria-hidden='true' />
        {label}
      </span>
      <NativeSelect
        aria-label={`Column of ${status.name}`}
        value={columnId ?? ''}
        disabled={pending}
        onChange={(event) =>
          onEdit({
            kind: 'update-status',
            status,
            name: status.name,
            column_id: event.target.value ? Number(event.target.value) : null,
          })
        }
      >
        <option value=''>Unmapped</option>
        {columns.map((column) => (
          <option key={column.id} value={column.id}>
            {column.name}
          </option>
        ))}
      </NativeSelect>
      <Button
        variant='ghost'
        size='icon'
        className={ICON}
        aria-label={`Delete status ${status.name}`}
        disabled={pending}
        onClick={() => onEdit({ kind: 'delete-status', status })}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

export const AddStatusForm = ({ onEdit }: { onEdit: OnEdit }) => {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('in_progress')
  return (
    <form
      className='flex flex-wrap items-end gap-2'
      onSubmit={(event) => {
        event.preventDefault()
        onEdit({ kind: 'add-status', name: name.trim(), category })
        setName('')
      }}
    >
      <label className='grid min-w-48 flex-1 gap-1 text-sm font-medium'>
        New status name
        <Input
          required
          maxLength={60}
          pattern='.*\S.*'
          value={name}
          onChange={(event) => setName(event.target.value)}
          className='h-11 md:h-9'
        />
      </label>
      <label className='grid gap-1 text-sm font-medium'>
        Category
        <NativeSelect
          value={category}
          onChange={(event) =>
            isCategory(event.target.value) && setCategory(event.target.value)
          }
        >
          {Object.entries(CATEGORY).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button type='submit' className='h-11 md:h-9'>
        <Plus />
        Add status
      </Button>
    </form>
  )
}
