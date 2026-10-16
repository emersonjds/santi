import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCorners,
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
import {
  moveCard,
  planMove,
  recount,
  statusMove,
} from '@/entities/issue/board-cache'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { CARD_LIST, EmptySlot } from '@/entities/issue/issue-card'
import { useMoveIssue } from '@/entities/issue/issue-mutations'
import { CATEGORY, type Status, statusesOf } from '@/entities/issue/statuses'
import type { BoardColumn, BoardView, Card } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'

type Lanes = Record<number, Card[]>

/** The order on screen while a card is held, and after the drop until the cache catches up. */
type Drag = { base: BoardView; lanes: Lanes; held: Card | null }

const lanesOf = (board: BoardView): Lanes =>
  Object.fromEntries(board.columns.map((column) => [column.id, column.cards]))

const COLUMN = 'column:'
const ZONE = 'zone:'

/** `zone:<column>:<status>`: one drop zone per status of a column holding several (SB-17). */
const zoneOf = (id: UniqueIdentifier) => {
  const name = String(id)
  if (!name.startsWith(ZONE)) return undefined
  const [columnId, statusId] = name.slice(ZONE.length).split(':').map(Number)
  return { columnId, statusId }
}

const laneOf = (lanes: Lanes, id: UniqueIdentifier) => {
  const name = String(id)
  if (name.startsWith(COLUMN)) return Number(name.slice(COLUMN.length))
  const zone = zoneOf(id)
  if (zone) return zone.columnId
  const found = Object.entries(lanes).find(([, cards]) =>
    cards.some((card) => card.key === name)
  )
  return found && Number(found[0])
}

/**
 * A zone under the pointer wins over the cards around it. The keyboard sensor
 * puts the card's top-left corner on its target, so that corner stands in for the pointer.
 */
const zonesFirst: CollisionDetection = (args) => {
  const { x, y } = args.pointerCoordinates ?? {
    x: args.collisionRect.left + 1,
    y: args.collisionRect.top + 1,
  }
  const zone = args.droppableContainers.find((container) => {
    const rect = args.droppableRects.get(container.id)
    return (
      zoneOf(container.id) &&
      rect &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    )
  })
  return zone ? [{ id: zone.id }] : closestCorners(args)
}

/** The lane once the held card sits where the pointer or arrow points. */
const placed = (lane: Card[], held: Card, target: UniqueIdentifier) => {
  const from = lane.findIndex((card) => card.key === held.key)
  const onto = lane.findIndex((card) => card.key === target)
  if (from >= 0) return onto < 0 ? lane : arrayMove(lane, from, onto)
  const joined = lane.slice()
  joined.splice(onto < 0 ? lane.length : onto, 0, held)
  return joined
}

const SortableCard = ({
  card,
  zoned,
  renderCard,
}: {
  card: Card
  zoned: boolean
  renderCard: (card: Card) => ReactNode
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.key,
    disabled: { draggable: false, droppable: zoned },
  })
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag ${card.key}`}
      aria-roledescription='draggable card'
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={cn(
        'touch-manipulation rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging &&
          'bg-accent outline-2 outline-offset-0 outline-primary outline-dashed',
        // Out of the flow under the zones, so they keep their size while the card hovers them.
        isDragging && zoned && 'invisible absolute'
      )}
    >
      <div className={cn(isDragging && 'invisible')}>{renderCard(card)}</div>
    </li>
  )
}

const Zone = ({
  columnId,
  status,
  shown,
  enabled,
}: {
  columnId: number
  status: Status
  shown: boolean
  enabled: boolean
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `${ZONE}${columnId}:${status.id}`,
    disabled: !enabled,
  })
  const { icon: Icon, label } = CATEGORY[status.category]
  return (
    <div
      ref={setNodeRef}
      role={shown ? 'group' : undefined}
      aria-label={shown ? status.name : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-sm',
        shown ? 'bg-background' : 'border-transparent',
        shown && (isOver ? 'border-primary bg-accent' : 'border-input')
      )}
    >
      {shown && (
        <>
          <span className='font-semibold'>{status.name}</span>
          <span className='flex items-center gap-1 text-xs text-muted-foreground'>
            <Icon className='size-3.5' />
            {label}
          </span>
        </>
      )}
    </div>
  )
}

type LaneProps = {
  columnId: number
  cards: Card[]
  statuses: Status[]
  /** A card from another column is held: this column takes it by status, not by position. */
  zoned: boolean
  /** The held card's key; once it sits in a zoned lane, the zones show. */
  heldKey?: string
  renderCard: (card: Card) => ReactNode
}

const Lane = ({
  columnId,
  cards,
  statuses,
  zoned,
  heldKey,
  renderCard,
}: LaneProps) => {
  const hovered = zoned && cards.some((card) => card.key === heldKey)
  const empty = cards.every((card) => hovered && card.key === heldKey)
  const { setNodeRef } = useDroppable({
    id: `${COLUMN}${columnId}`,
    disabled: zoned,
  })
  const several = statuses.length > 1
  return (
    <SortableContext
      items={cards.map((card) => card.key)}
      strategy={verticalListSortingStrategy}
    >
      {/* Room for every zone, kept off drag so the column never jumps. */}
      <div
        className='relative'
        style={
          several ? { minHeight: `${statuses.length * 4.5}rem` } : undefined
        }
      >
        <ol ref={setNodeRef} className={CARD_LIST}>
          {cards.map((card) => (
            <SortableCard
              key={card.key}
              card={card}
              zoned={zoned}
              renderCard={renderCard}
            />
          ))}
          {empty && <EmptySlot />}
        </ol>
        {several && (
          <div className='pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 px-2 pb-2'>
            {statuses.map((status) => (
              <Zone
                key={status.id}
                columnId={columnId}
                status={status}
                shown={hovered}
                enabled={zoned}
              />
            ))}
          </div>
        )}
      </div>
    </SortableContext>
  )
}

type SortableBoardProps = {
  board: BoardView
  projectKey: string
  renderColumn: (column: BoardColumn, list: ReactNode) => ReactNode
  renderCard: (card: Card) => ReactNode
}

/** dnd-kit layer over the board (lazy chunk): pointer and keyboard moves across and within columns. */
export const SortableBoard = ({
  board,
  projectKey,
  renderColumn,
  renderCard,
}: SortableBoardProps) => {
  const move = useMoveIssue(projectKey)
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const [drag, setDrag] = useState<Drag | null>(null)
  const pending = drag?.base === board ? drag : null
  const lanes = pending?.lanes ?? lanesOf(board)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const start = ({ active }: DragStartEvent) => {
    const held = board.columns
      .flatMap((column) => column.cards)
      .find((card) => card.key === active.id)
    if (held) setDrag({ base: board, lanes, held })
  }

  // Across columns the held card joins the target lane as it hovers; within one, sortable transforms do it.
  const over = ({ active, over: target }: DragOverEvent) => {
    if (!pending?.held || !target) return
    const from = laneOf(lanes, active.id)
    const to = laneOf(lanes, target.id)
    if (from === undefined || to === undefined || from === to) return
    setDrag({
      ...pending,
      lanes: {
        ...lanes,
        [from]: lanes[from].filter((card) => card.key !== active.id),
        [to]: placed(lanes[to], pending.held, target.id),
      },
    })
  }

  const end = ({ over: target }: DragEndEvent) => {
    const held = pending?.held
    const to = target ? laneOf(lanes, target.id) : undefined
    if (!held || !target || to === undefined) return setDrag(null)
    const zone = zoneOf(target.id)
    if (zone) {
      const plan = statusMove(board, held, zone.columnId, zone.statusId)
      setDrag({
        base: board,
        lanes: lanesOf(moveCard(board, plan)),
        held: null,
      })
      return move.mutate(plan)
    }
    const final = placed(lanes[to], held, target.id)
    const toIndex = final.findIndex((card) => card.key === held.key)
    const before = board.columns.find((column) => column.id === to)?.cards
    if (held.column_id === to && before?.[toIndex]?.key === held.key)
      return setDrag(null)
    setDrag({ base: board, lanes: { ...lanes, [to]: final }, held: null })
    move.mutate(planMove(board, held, to, toIndex))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={zonesFirst}
      onDragStart={start}
      onDragOver={over}
      onDragEnd={end}
      onDragCancel={() => setDrag(null)}
    >
      {board.columns.map((column) => {
        const cards = lanes[column.id]
        const statuses = statusesOf(settings, column.id)
        const held = pending?.held
        const zoned =
          !!held && statuses.length > 1 && held.column_id !== column.id
        return renderColumn(
          // KB-27: the header counts the held card where it hovers; a cancel restores it.
          recount(column, cards.length - column.cards.length),
          <Lane
            columnId={column.id}
            cards={cards}
            statuses={statuses}
            zoned={zoned}
            heldKey={held?.key}
            renderCard={renderCard}
          />
        )
      })}
      <DragOverlay>
        {pending?.held && (
          <div className='rounded-md shadow-lg'>{renderCard(pending.held)}</div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
