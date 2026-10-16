import { type ReactNode, useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
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
import { GripVertical } from 'lucide-react'
import { planRowMove } from '@/entities/issue/backlog-cache'
import { useMoveRow } from '@/entities/issue/issue-mutations'
import type { Backlog, BacklogSection, Card } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'

type Lanes = Record<string, Card[]>

/** The order on screen while a row is held, and after the drop until the cache catches up. */
type Drag = { base: Backlog; lanes: Lanes; held: Card | null }

const BACKLOG = 'backlog'
const MEASURE_ALWAYS = { droppable: { strategy: MeasuringStrategy.Always } }
const SECTION = 'section:'

const laneKey = (sprintId?: number | null) => String(sprintId ?? BACKLOG)
const sprintOfLane = (lane: string) => (lane === BACKLOG ? null : Number(lane))

const lanesOf = (backlog: Backlog): Lanes =>
  Object.fromEntries(
    backlog.sections.map((section) => [
      laneKey(section.sprint?.id),
      section.cards,
    ])
  )

const laneOf = (lanes: Lanes, id: UniqueIdentifier) => {
  const name = String(id)
  if (name.startsWith(SECTION)) return name.slice(SECTION.length)
  return Object.keys(lanes).find((lane) =>
    lanes[lane].some((card) => card.key === name)
  )
}

/** The lane once the held row sits where the pointer or arrow points. */
const placed = (lane: Card[], held: Card, target: UniqueIdentifier) => {
  const from = lane.findIndex((card) => card.key === held.key)
  const onto = lane.findIndex((card) => card.key === target)
  if (from >= 0) return onto < 0 ? lane : arrayMove(lane, from, onto)
  const joined = lane.slice()
  joined.splice(onto < 0 ? lane.length : onto, 0, held)
  return joined
}

type RenderRow = (card: Card, handle: ReactNode) => ReactNode
type RenderList = (
  section: BacklogSection,
  cards: Card[],
  renderItem: (card: Card) => ReactNode
) => ReactNode

const SortableRow = ({
  card,
  renderRow,
}: {
  card: Card
  renderRow: RenderRow
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.key })
  const handle = (
    <button
      type='button'
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag ${card.key}`}
      aria-roledescription='draggable row'
      className='relative z-10 grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-sm text-subtle-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
    >
      <GripVertical className='size-4' />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={cn(
        isDragging && 'bg-accent outline-2 outline-primary outline-dashed'
      )}
    >
      <div className={cn(isDragging && 'opacity-0')}>
        {renderRow(card, handle)}
      </div>
    </div>
  )
}

const Lane = ({
  section,
  cards,
  renderList,
  renderRow,
}: {
  section: BacklogSection
  cards: Card[]
  renderList: RenderList
  renderRow: RenderRow
}) => {
  // Only an empty section takes drops itself; a filled one takes them through its rows.
  const { setNodeRef } = useDroppable({
    id: `${SECTION}${laneKey(section.sprint?.id)}`,
    disabled: cards.length > 0,
  })
  return (
    <SortableContext
      items={cards.map((card) => card.key)}
      strategy={verticalListSortingStrategy}
    >
      <div ref={setNodeRef}>
        {renderList(section, cards, (card) => (
          <SortableRow card={card} renderRow={renderRow} />
        ))}
      </div>
    </SortableContext>
  )
}

type SortableBacklogProps = {
  backlog: Backlog
  projectKey: string
  renderSection: (section: BacklogSection, list: ReactNode) => ReactNode
  renderList: RenderList
  renderRow: RenderRow
}

/** dnd-kit layer over the backlog (lazy chunk): pointer and keyboard moves within and across sections (BL-13). */
export const SortableBacklog = ({
  backlog,
  projectKey,
  renderSection,
  renderList,
  renderRow,
}: SortableBacklogProps) => {
  const move = useMoveRow(projectKey)
  const [drag, setDrag] = useState<Drag | null>(null)
  const pending = drag?.base === backlog ? drag : null
  const lanes = pending?.lanes ?? lanesOf(backlog)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const start = ({ active }: DragStartEvent) => {
    const held = backlog.sections
      .flatMap((section) => section.cards)
      .find((card) => card.key === active.id)
    if (held) setDrag({ base: backlog, lanes, held })
  }

  // Across sections the held row joins the target lane as it hovers; within one, sortable transforms do it.
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
    const home = laneKey(held.sprint_id)
    if (home === to && lanesOf(backlog)[home][toIndex]?.key === held.key)
      return setDrag(null)
    setDrag({ base: backlog, lanes: { ...lanes, [to]: final }, held: null })
    move.mutate(planRowMove(backlog, held, sprintOfLane(to), toIndex))
  }

  return (
    <DndContext
      sensors={sensors}
      // Rows measured before the pickup: an arrow pressed right after it already finds its neighbours.
      measuring={MEASURE_ALWAYS}
      collisionDetection={closestCorners}
      onDragStart={start}
      onDragOver={over}
      onDragEnd={end}
      onDragCancel={() => setDrag(null)}
    >
      {backlog.sections.map((section) =>
        renderSection(
          section,
          <Lane
            section={section}
            cards={lanes[laneKey(section.sprint?.id)]}
            renderList={renderList}
            renderRow={renderRow}
          />
        )
      )}
      <DragOverlay>
        {pending?.held && (
          <div className='overflow-hidden rounded-md shadow-lg'>
            {renderRow(pending.held, <span className='w-6 shrink-0' />)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
