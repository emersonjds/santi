import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  type BoardSearch,
  boardFilters,
  boardQuery,
  boardSettingsQuery,
} from '@/entities/issue/board-query'
import { CARD_LIST, EmptySlot, IssueCard } from '@/entities/issue/issue-card'
import type { BoardView } from '@/shared/api/client'
import { ColumnPicker, ColumnShell } from './board-column'
import { BoardSkeleton, NoSprint, SprintStrip } from './board-states'
import { FilterBar } from './filter-bar'

type BoardProps = { projectKey: string; search: BoardSearch }

const DoneNote = ({ days }: { days: number }) => (
  <p className='px-3 pb-3 text-xs text-subtle-foreground'>
    Done issues leave the board {days} days after they finish.
  </p>
)

const Columns = ({
  board,
  projectKey,
  shown,
  doneWindow,
}: {
  board: BoardView
  projectKey: string
  shown: number
  doneWindow?: number | null
}) => (
  <div className='flex flex-1 gap-3 overflow-x-auto overscroll-x-contain pb-2'>
    {board.columns.map((column, index) => (
      <ColumnShell
        key={column.id}
        column={column}
        narrowHidden={column.id !== shown}
        footer={
          doneWindow != null &&
          index === board.columns.length - 1 && <DoneNote days={doneWindow} />
        }
      >
        <ol className={CARD_LIST}>
          {column.cards.map((card) => (
            <li key={card.key}>
              <IssueCard card={card} projectKey={projectKey} />
            </li>
          ))}
          {column.cards.length === 0 && <EmptySlot />}
        </ol>
      </ColumnShell>
    ))}
  </div>
)

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
      <Columns
        board={board}
        projectKey={projectKey}
        shown={shown}
        doneWindow={
          board.board_type === 'kanban' ? settings?.done_window_days : null
        }
      />
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
