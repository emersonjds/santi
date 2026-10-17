import { type CSSProperties, type ReactNode, type Ref, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { isCategory } from '@/entities/issue/statuses'
import { lockedButton, useReadOnly } from '@/shared/lib/read-only'
import { cn } from '@/shared/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog'
import { Button, buttonVariants } from '@/shared/ui/button'
import { CommitInput } from '@/shared/ui/commit-input'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { COLUMN, STATUS, useHeld } from './drag-kinds'
import { type Column, type OnEdit, isPending } from './settings-edits'
import { ICON, StatusZone } from './status-rows'

type RowProps = {
  column: Column
  kanban: boolean
  onEdit: OnEdit
  handle?: ReactNode
  actions: ReactNode
  rowRef?: Ref<HTMLLIElement>
  style?: CSSProperties
}

export const ColumnRow = ({
  column,
  kanban,
  onEdit,
  handle,
  actions,
  rowRef,
  style,
}: RowProps) => (
  <li
    ref={rowRef}
    style={style}
    className='grid gap-2 rounded-md border bg-card p-3'
  >
    <div className='flex flex-wrap items-center gap-2'>
      {handle}
      <CommitInput
        aria-label={`Name of column ${column.name}`}
        value={column.name}
        required
        maxLength={60}
        disabled={isPending(column)}
        className='h-11 min-w-40 flex-1 md:h-9'
        onCommit={(name) =>
          onEdit({
            kind: 'update-column',
            column,
            name,
            wip_limit: column.wip_limit ?? null,
          })
        }
      />
      {kanban && (
        <CommitInput
          type='number'
          min={1}
          inputMode='numeric'
          placeholder='No limit'
          aria-label={`WIP limit of ${column.name}`}
          value={column.wip_limit?.toString() ?? ''}
          disabled={isPending(column)}
          className='h-11 w-28 md:h-9'
          onCommit={(limit) =>
            onEdit({
              kind: 'update-column',
              column,
              name: column.name,
              wip_limit: limit ? Number(limit) : null,
            })
          }
        />
      )}
      <span className='ms-auto flex items-center gap-1'>{actions}</span>
    </div>
    <StatusZone
      id={String(column.id)}
      label={`Statuses in ${column.name}`}
      statuses={column.statuses}
    />
  </li>
)

/** D16: a column holding statuses hands them to a column picked here; nothing leaves the board. */
const DeleteColumnButton = ({
  column,
  columns,
  onEdit,
}: {
  column: Column
  columns: Column[]
  onEdit: OnEdit
}) => {
  const others = columns.filter((each) => each.id !== column.id)
  const nextTo = others[Math.max(columns.indexOf(column) - 1, 0)]
  const [target, setTarget] = useState(nextTo.id)
  const holds = column.statuses.length > 0
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className={ICON}
          aria-label={`Delete column ${column.name}`}
          disabled={isPending(column)}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {column.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {holds
              ? 'Its statuses move to the column you pick, and their issues with them.'
              : 'It holds no status, so no issue moves.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {holds && (
          <label className='grid gap-1 text-sm font-medium'>
            Move its statuses to
            <NativeSelect
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
            >
              {others.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11 md:h-9'>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              buttonVariants({ variant: 'destructive' }),
              'h-11 md:h-9'
            )}
            onClick={() =>
              onEdit({
                kind: 'delete-column',
                column,
                move_statuses_to: holds ? target : undefined,
              })
            }
          >
            Delete column
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type SortableColumnProps = {
  column: Column
  columns: Column[]
  index: number
  last: number
  kanban: boolean
  onEdit: OnEdit
  reorder: (from: number, to: number) => void
}

export const SortableColumn = ({
  column,
  columns,
  index,
  last,
  kanban,
  onEdit,
  reorder,
}: SortableColumnProps) => {
  const statusHeld = useHeld(STATUS)
  const note = useReadOnly()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${COLUMN}${column.id}`,
    disabled: { draggable: isPending(column), droppable: statusHeld },
  })
  return (
    <ColumnRow
      column={column}
      kanban={kanban}
      onEdit={onEdit}
      rowRef={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(0, ${transform.y}px, 0)`
          : undefined,
        transition,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
      handle={
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag column ${column.name}`}
          {...lockedButton(note)}
          className={cn(
            ICON,
            'inline-flex touch-manipulation items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
          )}
        >
          <GripVertical className='size-4' />
        </button>
      }
      actions={
        <>
          <Button
            variant='ghost'
            size='icon'
            className={ICON}
            aria-label={`Move ${column.name} up`}
            disabled={index === 0 || isPending(column)}
            onClick={() => reorder(index, index - 1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className={ICON}
            aria-label={`Move ${column.name} down`}
            disabled={index === last || isPending(column)}
            onClick={() => reorder(index, index + 1)}
          >
            <ArrowDown />
          </Button>
          <DeleteColumnButton
            column={column}
            columns={columns}
            onEdit={onEdit}
          />
        </>
      }
    />
  )
}

export const AddColumnForm = ({ onEdit }: { onEdit: OnEdit }) => {
  const [name, setName] = useState('')
  const [status, setStatus] = useState('in_progress')
  return (
    <form
      className='flex flex-wrap items-end gap-2'
      onSubmit={(event) => {
        event.preventDefault()
        onEdit({
          kind: 'add-column',
          name: name.trim(),
          new_status: isCategory(status) ? status : null,
        })
        setName('')
      }}
    >
      <label className='grid min-w-48 flex-1 gap-1 text-sm font-medium'>
        New column name
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
        Its status
        <NativeSelect
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value='in_progress'>New, in progress</option>
          <option value='todo'>New, to do</option>
          <option value='none'>None yet</option>
        </NativeSelect>
      </label>
      <Button type='submit' className='h-11 md:h-9'>
        <Plus />
        Add column
      </Button>
    </form>
  )
}
