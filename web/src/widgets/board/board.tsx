import {
  type ReactNode,
  Suspense,
  lazy,
  memo,
  useCallback,
  useState,
} from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Ellipsis } from 'lucide-react'
import { useAssignKey } from '@/features/issue-quick-actions/assign-key'
import type { SprintAction } from '@/features/sprint/sprint-dialog'
import { recount } from '@/entities/issue/board-cache'
import { BoardContext } from '@/entities/issue/board-context'
import {
  type BoardSearch,
  countFilters,
  boardFilters,
  boardQuery,
  boardSettingsQuery,
} from '@/entities/issue/board-query'
import { CARD_LIST, EmptySlot, IssueCard } from '@/entities/issue/issue-card'
import { useUpdateIssue } from '@/entities/issue/issue-mutations'
import { ImportHint } from '@/entities/project/import-hint'
import { projectQuery } from '@/entities/project/project-queries'
import { useProjectWritable } from '@/entities/project/writable'
import { WriteLock } from '@/entities/project/write-lock'
import type {
  BoardColumn,
  BoardSettings,
  BoardView,
  Card,
  Sprint,
} from '@/shared/api/client'
import { HeldEditors, createHeldEditors } from '@/shared/lib/held-editor'
import { useIsMobile } from '@/shared/lib/use-mobile'
import { ColumnPicker, ColumnShell } from './board-column'
import { BoardSkeleton, NoSprint, SprintStrip } from './board-states'
import { CreateSlot } from './create-slot'
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

const ColumnLimit = lazy(() =>
  import('@/features/board-settings/column-limit').then((module) => ({
    default: module.ColumnLimit,
  }))
)

const CardMenu = lazy(() =>
  import('@/features/issue-quick-actions/card-menu').then((module) => ({
    default: module.CardMenu,
  }))
)

const DeleteIssueDialog = lazy(() =>
  import('@/features/delete-issue/delete-issue-dialog').then((module) => ({
    default: module.DeleteIssueDialog,
  }))
)

// Lazy: the sprint forms load on the first sprint action (D39).
const SprintDialog = lazy(() =>
  import('@/features/sprint/sprint-dialog').then((module) => ({
    default: module.SprintDialog,
  }))
)

const SprintMenu = lazy(() =>
  import('@/features/sprint/sprint-menu').then((module) => ({
    default: module.SprintMenu,
  }))
)

/** The running sprint with its "…": edit or complete it without going to the backlog (R-4, SP-18). */
const RunningSprint = ({
  sprint,
  projectKey,
}: {
  sprint: Sprint
  projectKey: string
}) => {
  const [dialog, setDialog] = useState<SprintAction | null>(null)
  return (
    <>
      <SprintStrip
        sprint={sprint}
        menu={
          <Suspense fallback={<span className='block size-11 md:size-9' />}>
            <SprintMenu
              sprint={sprint}
              onEdit={() => setDialog({ kind: 'edit', sprint })}
              onComplete={() => setDialog({ kind: 'complete', sprint })}
            />
          </Suspense>
        }
      />
      {dialog && (
        <Suspense fallback={null}>
          <SprintDialog
            projectKey={projectKey}
            action={dialog}
            onClose={() => setDialog(null)}
          />
        </Suspense>
      )}
    </>
  )
}

const MenuPlaceholder = () => (
  <span
    aria-hidden='true'
    className='grid size-11 place-items-center text-muted-foreground md:size-10'
  >
    <Ellipsis className='size-4' />
  </span>
)

type BoardCardProps = {
  card: Card
  projectKey: string
  onDelete: (card: Card) => void
}

const BoardCard = memo(({ card, projectKey, onDelete }: BoardCardProps) => (
  <IssueCard
    card={card}
    projectKey={projectKey}
    menu={
      <Suspense fallback={<MenuPlaceholder />}>
        <CardMenu card={card} projectKey={projectKey} onDelete={onDelete} />
      </Suspense>
    }
  />
))

type ColumnsProps = {
  board: BoardView
  projectKey: string
  shown: number
  settings?: BoardSettings
  /** KB-16: admins of a kanban board set limits from the column header. */
  limits: boolean
}

/** Plain lists first; on wide screens the drag layer takes over with the same markup once its chunk loads. */
const Columns = ({
  board,
  projectKey,
  shown,
  settings,
  limits,
}: ColumnsProps) => {
  const doneWindow =
    board.board_type === 'kanban' ? settings?.done_window_days : null
  const narrow = useIsMobile()
  const writable = useProjectWritable(projectKey)
  // Held here, above the drag layer swap, so an open form survives it; one column's form at a time.
  const [creating, setCreating] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Card | null>(null)
  const [editors] = useState(createHeldEditors)
  const last = board.columns[board.columns.length - 1]
  useAssignKey(
    () => (writable ? board.columns.flatMap((column) => column.cards) : []),
    useUpdateIssue(projectKey)
  )
  const renderCard = useCallback(
    (card: Card) => (
      <BoardCard card={card} projectKey={projectKey} onDelete={setDeleting} />
    ),
    [projectKey]
  )
  const withSettingsLimit = (column: BoardColumn) => {
    const limit = settings?.columns.find(
      (each) => each.id === column.id
    )?.wip_limit
    return limit === undefined
      ? column
      : recount({ ...column, wip_limit: limit }, 0)
  }
  const renderColumn = (column: BoardColumn, list: ReactNode) => (
    <ColumnShell
      key={column.id}
      column={withSettingsLimit(column)}
      narrowHidden={column.id !== shown}
      menu={
        limits && (
          <Suspense fallback={<span className='block size-11 md:size-8' />}>
            <ColumnLimit projectKey={projectKey} columnId={column.id} />
          </Suspense>
        )
      }
      footer={
        <>
          <CreateSlot
            sprintId={board.sprint?.id}
            columnId={column.id}
            projectKey={projectKey}
            open={creating === column.id}
            setOpen={(open) => setCreating(open ? column.id : null)}
          />
          {doneWindow != null && column.id === last.id && (
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
        {column.cards.length === 0 && writable && <EmptySlot />}
      </ol>
    )
  )

  return (
    <div className='flex flex-1 gap-3 overflow-x-auto overscroll-x-contain pb-2'>
      <HeldEditors value={editors}>
        {narrow || !writable ? (
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
      </HeldEditors>
      {deleting && (
        <Suspense fallback={null}>
          <DeleteIssueDialog
            projectKey={projectKey}
            issueKey={deleting.key}
            issueType={deleting.issue_type}
            onClose={() => setDeleting(null)}
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
  const { data: project } = useQuery(projectQuery(projectKey))
  if (error) throw error
  if (!board) return <BoardSkeleton scrum={project?.board_type === 'scrum'} />
  if (board.board_type === 'scrum' && !board.sprint)
    return <NoSprint projectKey={projectKey} />
  const shown =
    board.columns.find((column) => column.id === search.column)?.id ??
    board.columns[0]?.id

  return (
    <>
      {board.sprint && (
        <WriteLock projectKey={projectKey}>
          <RunningSprint sprint={board.sprint} projectKey={projectKey} />
        </WriteLock>
      )}
      <FilterBar projectKey={projectKey} search={search} text />
      {board.columns.every((column) => column.cards.length === 0) &&
        (countFilters(search) > 0 ? (
          <p className='text-sm text-muted-foreground'>
            No issues match these filters.
          </p>
        ) : (
          // A scrum board shows one sprint, so only the backlog tells an empty project.
          board.board_type === 'kanban' && (
            <ImportHint projectKey={projectKey} />
          )
        ))}
      <ColumnPicker
        projectKey={projectKey}
        columns={board.columns}
        shown={shown}
      />
      <BoardContext value={board}>
        <WriteLock projectKey={projectKey}>
          <Columns
            board={board}
            projectKey={projectKey}
            shown={shown}
            settings={settings}
            limits={
              board.board_type === 'kanban' &&
              project?.role === 'admin' &&
              project.state !== 'archived'
            }
          />
        </WriteLock>
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
