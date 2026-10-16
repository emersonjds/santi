import { useSuspenseQuery } from '@tanstack/react-query'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { RootError } from '@/shared/ui/root-error'
import { AddColumnForm, ColumnRow, SortableColumn } from './column-rows'
import { COLUMN, STATUS, UNMAPPED, ZONE } from './drag-kinds'
import { type OnEdit, useSettingsEdit } from './settings-edits'
import { AddStatusForm, StatusRow, StatusZone } from './status-rows'

const after = (prefix: string, id: UniqueIdentifier) => {
  const text = String(id)
  return text.startsWith(prefix) ? text.slice(prefix.length) : undefined
}

const SECTION_TITLE = 'text-base font-semibold'
const NOTE = 'text-sm text-muted-foreground'

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
