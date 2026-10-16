import { type ReactNode, useState } from 'react'
import {
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
import { planMove } from '@/entities/issue/board-cache'
import { CARD_LIST, EmptySlot } from '@/entities/issue/issue-card'
import { useMoveIssue } from '@/entities/issue/issue-mutations'
import type { BoardColumn, BoardView, Card } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'

type Lanes = Record<number, Card[]>

/** The order on screen while a card is held, and after the drop until the cache catches up. */
type Drag = { base: BoardView; lanes: Lanes; held: Card | null }

const lanesOf = (board: BoardView): Lanes =>
  Object.fromEntries(board.columns.map((column) => [column.id, column.cards]))

const COLUMN = 'column:'

const laneOf = (lanes: Lanes, id: UniqueIdentifier) => {
  const name = String(id)
  if (name.startsWith(COLUMN)) return Number(name.slice(COLUMN.length))
  const found = Object.entries(lanes).find(([, cards]) =>
    cards.some((card) => card.key === name)
  )
  return found && Number(found[0])
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
  renderCard,
}: {
  card: Card
  renderCard: (card: Card) => ReactNode
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.key })
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
          'bg-accent outline-2 outline-offset-0 outline-primary outline-dashed'
      )}
    >
      <div className={cn(isDragging && 'invisible')}>{renderCard(card)}</div>
    </li>
  )
}

const Lane = ({
  columnId,
  cards,
  renderCard,
}: {
  columnId: number
  cards: Card[]
  renderCard: (card: Card) => ReactNode
}) => {
  const { setNodeRef } = useDroppable({ id: `${COLUMN}${columnId}` })
  return (
    <SortableContext
      items={cards.map((card) => card.key)}
      strategy={verticalListSortingStrategy}
    >
      <ol ref={setNodeRef} className={CARD_LIST}>
        {cards.map((card) => (
          <SortableCard key={card.key} card={card} renderCard={renderCard} />
        ))}
        {cards.length === 0 && <EmptySlot />}
      </ol>
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
      collisionDetection={closestCorners}
      onDragStart={start}
      onDragOver={over}
      onDragEnd={end}
      onDragCancel={() => setDrag(null)}
    >
      {board.columns.map((column) =>
        renderColumn(
          column,
          <Lane
            columnId={column.id}
            cards={lanes[column.id]}
            renderCard={renderCard}
          />
        )
      )}
      <DragOverlay>
        {pending?.held && (
          <div className='rounded-md shadow-lg'>{renderCard(pending.held)}</div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
