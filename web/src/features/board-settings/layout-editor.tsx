import { type CSSProperties, type ReactNode, type Ref, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  useDraggable,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { StatusPill } from '@/entities/issue/status-pill'
import { CATEGORY, type Category, type Status } from '@/entities/issue/statuses'
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
import { RootError } from '@/shared/ui/root-error'
import {
  type Column,
  type Edit,
  isPending,
  useSettingsEdit,
} from './settings-edits'

type OnEdit = (edit: Edit) => void

const COLUMN = 'column:'
const ZONE = 'zone:'
const STATUS = 'status:'
const UNMAPPED = 'unmapped'

const after = (prefix: string, id: UniqueIdentifier) => {
  const text = String(id)
  return text.startsWith(prefix) ? text.slice(prefix.length) : undefined
}

/** While one kind is held, the other kind's targets step aside: columns sort among columns, chips land on zones. */
const useHeld = (prefix: string) =>
  String(useDndContext().active?.id ?? '').startsWith(prefix)

const isCategory = (value: string): value is Category =>
  Object.keys(CATEGORY).includes(value)

const ICON = 'size-11 md:size-9'
const SECTION_TITLE = 'text-base font-semibold'
const NOTE = 'text-sm text-muted-foreground'

/** Not focusable, so pointer drag only: the keyboard (and a phone) maps a status with its column select. */
const StatusChip = ({ status }: { status: Status }) => {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${STATUS}${status.id}`,
    disabled: isPending(status),
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
        'cursor-grab rounded-full',
        isDragging && 'relative z-10 cursor-grabbing shadow-lg'
      )}
    >
      <StatusPill status={status} />
    </li>
  )
}

const StatusZone = ({
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

type RowProps = {
  column: Column
  kanban: boolean
  onEdit: OnEdit
  handle?: ReactNode
  actions: ReactNode
  rowRef?: Ref<HTMLLIElement>
  style?: CSSProperties
}

const ColumnRow = ({
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

const SortableColumn = ({
  column,
  columns,
  index,
  last,
  kanban,
  onEdit,
  reorder,
}: SortableColumnProps) => {
  const statusHeld = useHeld(STATUS)
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
          className={cn(
            ICON,
            'inline-flex touch-manipulation items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
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

const AddColumnForm = ({ onEdit }: { onEdit: OnEdit }) => {
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

const StatusRow = ({
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

const AddStatusForm = ({ onEdit }: { onEdit: OnEdit }) => {
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

type LayoutEditorProps = { projectKey: string; kanban: boolean }

/** SB-2..7, KB-2/4/5/12, D2, D16: columns and statuses, edited at once; dnd-kit loads with this chunk. */
export const LayoutEditor = ({ projectKey, kanban }: LayoutEditorProps) => {
  const { data: settings } = useSuspenseQuery(boardSettingsQuery(projectKey))
  const edit = useSettingsEdit(projectKey)
  const onEdit: OnEdit = (change) => edit.mutate(change)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const { columns } = settings
  const movable = columns.slice(0, -1)
  const rightmost = columns[columns.length - 1]
  const statuses = [
    ...columns.flatMap((column) => column.statuses),
    ...settings.unmapped,
  ]
  const refusal = (scope: 'column' | 'status') =>
    edit.variables?.kind.includes(scope) ? edit.error?.message : undefined

  const reorder = (from: number, to: number) =>
    onEdit({
      kind: 'reorder-columns',
      column_ids: [...arrayMove(movable, from, to), rightmost].map(
        (column) => column.id
      ),
    })

  const end = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const statusId = after(STATUS, active.id)
    const zone = after(ZONE, over.id)
    if (statusId !== undefined && zone !== undefined) {
      const status = statuses.find((each) => String(each.id) === statusId)
      const column_id = zone === UNMAPPED ? null : Number(zone)
      if (status && (status.column_id ?? null) !== column_id)
        onEdit({ kind: 'update-status', status, name: status.name, column_id })
      return
    }
    const indexOf = (id: UniqueIdentifier) =>
      movable.findIndex((column) => `${COLUMN}${column.id}` === id)
    const from = indexOf(active.id)
    const to = indexOf(over.id)
    if (from >= 0 && to >= 0 && from !== to) reorder(from, to)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={end}
    >
      <section aria-labelledby='columns-title' className='grid gap-3'>
        <h3 id='columns-title' className={SECTION_TITLE}>
          Columns
        </h3>
        <p className={NOTE}>
          Left to right, as on the board. Done work lands in the rightmost
          column, which stays last.
          {kanban &&
            ' Past its WIP limit a column turns amber; cards still move in.'}
        </p>
        <RootError message={refusal('column')} />
        <SortableContext
          items={movable.map((column) => `${COLUMN}${column.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <ol aria-label='Columns' className='grid gap-2'>
            {movable.map((column, index) => (
              <SortableColumn
                key={column.id}
                column={column}
                columns={columns}
                index={index}
                last={movable.length - 1}
                kanban={kanban}
                onEdit={onEdit}
                reorder={reorder}
              />
            ))}
            <ColumnRow
              column={rightmost}
              kanban={kanban}
              onEdit={onEdit}
              actions={
                <span className='text-xs text-subtle-foreground'>
                  Stays rightmost
                </span>
              }
            />
          </ol>
        </SortableContext>
        <AddColumnForm onEdit={onEdit} />
      </section>

      <section aria-labelledby='statuses-title' className='grid gap-3'>
        <h3 id='statuses-title' className={SECTION_TITLE}>
          Statuses
        </h3>
        <p className={NOTE}>
          Drag a status between columns, or pick its column. Done statuses live
          only in the rightmost column, and it holds nothing else.
        </p>
        <RootError message={refusal('status')} />
        <div className='grid gap-1'>
          <span className='text-sm font-medium'>Unmapped</span>
          <StatusZone
            id={UNMAPPED}
            label='Unmapped statuses'
            statuses={settings.unmapped}
          />
          <span className='text-xs text-subtle-foreground'>
            Issues in these statuses stay off the board and the backlog.
          </span>
        </div>
        <ul
          aria-label='Every status'
          className='grid gap-px overflow-hidden rounded-md border bg-border'
        >
          {statuses.map((status) => (
            <StatusRow
              key={status.id}
              status={status}
              columns={columns}
              onEdit={onEdit}
            />
          ))}
        </ul>
        <AddStatusForm onEdit={onEdit} />
      </section>
    </DndContext>
  )
}
