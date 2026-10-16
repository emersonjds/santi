import {
  type ReactNode,
  Suspense,
  lazy,
  memo,
  useCallback,
  useState,
} from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Ellipsis, Plus } from 'lucide-react'
import { BoardContext } from '@/entities/issue/board-context'
import {
  type BoardSearch,
  boardFilters,
  boardQuery,
  boardSettingsQuery,
} from '@/entities/issue/board-query'
import { CARD_LIST, EmptySlot, IssueCard } from '@/entities/issue/issue-card'
import type { BoardColumn, BoardView, Card } from '@/shared/api/client'
import { useIsMobile } from '@/shared/lib/use-mobile'
import { ColumnPicker, ColumnShell } from './board-column'
import { BoardSkeleton, NoSprint, SprintStrip } from './board-states'
import { FilterBar } from './filter-bar'

type BoardProps = { projectKey: string; search: BoardSearch }

const DoneNote = ({ days }: { days: number }) => (
  <p className='px-3 pb-3 text-xs text-subtle-foreground'>
    Done issues leave the board {days} days after they finish.
  </p>
)

const SortableBoard = lazy(() =>
  import('@/features/move-issue/sortable-board').then((module) => ({
    default: module.SortableBoard,
  }))
)

const CardMenu = lazy(() =>
  import('@/features/issue-quick-actions/card-menu').then((module) => ({
    default: module.CardMenu,
  }))
)

const InlineCreate = lazy(() =>
  import('@/features/create-issue/inline-create').then((module) => ({
    default: module.InlineCreate,
  }))
)

const CREATE_ROW =
  'mx-2 mb-2 flex h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground md:h-9'

type ColumnCreateProps = {
  board: BoardView
  projectKey: string
  open: boolean
  setOpen: (open: boolean) => void
}

/** D5: inline create at the foot of the first column; the form loads on the first click. */
const ColumnCreate = ({
  board,
  projectKey,
  open,
  setOpen,
}: ColumnCreateProps) => {
  if (!open)
    return (
      <button
        type='button'
        className={`${CREATE_ROW} outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring`}
        onClick={() => setOpen(true)}
      >
        <Plus className='size-4' />
        Create issue
      </button>
    )
  return (
    <Suspense fallback={<div className={CREATE_ROW} />}>
      <InlineCreate
        board={board}
        projectKey={projectKey}
        onClose={() => setOpen(false)}
      />
    </Suspense>
  )
}

// Same box as the menu button, so nothing moves when the menu chunk arrives.
const MenuPlaceholder = () => (
  <span
    aria-hidden='true'
    className='grid size-10 place-items-center text-muted-foreground'
  >
    <Ellipsis className='size-4' />
  </span>
)

const BoardCard = memo(
  ({ card, projectKey }: { card: Card; projectKey: string }) => (
    <IssueCard
      card={card}
      projectKey={projectKey}
      menu={
        <Suspense fallback={<MenuPlaceholder />}>
          <CardMenu card={card} projectKey={projectKey} />
        </Suspense>
      }
    />
  )
)

type ColumnsProps = {
  board: BoardView
  projectKey: string
  shown: number
  doneWindow?: number | null
}

/** Plain lists first; on wide screens the drag layer takes over with the same markup once its chunk loads. */
const Columns = ({ board, projectKey, shown, doneWindow }: ColumnsProps) => {
  const narrow = useIsMobile()
  // Held here, above the drag layer swap, so an open form survives it.
  const [creating, setCreating] = useState(false)
  const [first] = board.columns
  const last = board.columns[board.columns.length - 1]
  const renderCard = useCallback(
    (card: Card) => <BoardCard card={card} projectKey={projectKey} />,
    [projectKey]
  )
  const renderColumn = (column: BoardColumn, list: ReactNode) => (
    <ColumnShell
      key={column.id}
      column={column}
      narrowHidden={column.id !== shown}
      footer={
        <>
          {column === first && (
            <ColumnCreate
              board={board}
              projectKey={projectKey}
              open={creating}
              setOpen={setCreating}
            />
          )}
          {doneWindow != null && column === last && (
            <DoneNote days={doneWindow} />
          )}
        </>
      }
    >
      {list}
    </ColumnShell>
  )
  const plain = board.columns.map((column) =>
    renderColumn(
      column,
      <ol className={CARD_LIST}>
        {column.cards.map((card) => (
          <li key={card.key}>{renderCard(card)}</li>
        ))}
        {column.cards.length === 0 && <EmptySlot />}
      </ol>
    )
  )

  return (
    <div className='flex flex-1 gap-3 overflow-x-auto overscroll-x-contain pb-2'>
      {narrow ? (
        plain
      ) : (
        <Suspense fallback={plain}>
          <SortableBoard
            board={board}
            projectKey={projectKey}
            renderColumn={renderColumn}
            renderCard={renderCard}
          />
        </Suspense>
      )}
    </div>
  )
}

const BoardBody = ({ projectKey, search }: BoardProps) => {
  const { data: board, error } = useQuery({
    ...boardQuery(projectKey, boardFilters(search)),
    placeholderData: keepPreviousData,
  })
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  if (error) throw error
  if (!board) return <BoardSkeleton />
  if (board.board_type === 'scrum' && !board.sprint)
    return <NoSprint projectKey={projectKey} />
  const shown =
    board.columns.find((column) => column.id === search.column)?.id ??
    board.columns[0]?.id

  return (
    <>
      {board.sprint && <SprintStrip sprint={board.sprint} />}
      <FilterBar projectKey={projectKey} search={search} />
      {(search.assignee || search.recently_updated) &&
        board.columns.every((column) => column.cards.length === 0) && (
          <p className='text-sm text-muted-foreground'>
            No issues match these filters.
          </p>
        )}
      <ColumnPicker
        projectKey={projectKey}
        columns={board.columns}
        shown={shown}
      />
      <BoardContext value={board}>
        <Columns
          board={board}
          projectKey={projectKey}
          shown={shown}
          doneWindow={
            board.board_type === 'kanban' ? settings?.done_window_days : null
          }
        />
      </BoardContext>
    </>
  )
}

export const Board = (props: BoardProps) => (
  <section
    aria-label='Board'
    className='flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-6'
  >
    <BoardBody {...props} />
  </section>
)
