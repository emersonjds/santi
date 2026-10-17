import {
  type ReactNode,
  Suspense,
  lazy,
  useCallback,
  useMemo,
  useState,
} from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Layers } from 'lucide-react'
import { CreateSlot } from '@/widgets/board/create-slot'
import { FilterBar } from '@/widgets/board/filter-bar'
import { TOGGLE } from '@/widgets/board/filter-controls'
import { RowEditorsProvider } from '@/features/edit-row/row-fields'
import { useAssignKey } from '@/features/issue-quick-actions/assign-key'
import type { SprintAction } from '@/features/sprint/sprint-dialog'
import { backlogQuery } from '@/entities/issue/backlog-query'
import { BacklogContext } from '@/entities/issue/board-context'
import {
  type BoardSearch,
  countFilters,
  boardFilters,
  boardSettingsQuery,
} from '@/entities/issue/board-query'
import { useUpdateRow } from '@/entities/issue/issue-mutations'
import { type Status, statusesById } from '@/entities/issue/statuses'
import { ImportHint } from '@/entities/project/import-hint'
import type {
  Backlog as BacklogView,
  BacklogSection,
  Card,
  Sprint,
} from '@/shared/api/client'
import { useIsMobile } from '@/shared/lib/use-mobile'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { BacklogRow, HandleSlot, MenuSlot } from './backlog-row'
import { RowList } from './row-list'
import { SectionHeader } from './section-header'

type BacklogProps = { projectKey: string; search: BoardSearch }

const SortableBacklog = lazy(() =>
  import('@/features/move-issue/sortable-backlog').then((module) => ({
    default: module.SortableBacklog,
  }))
)

// Lazy: dnd-kit's droppable and the phone sheet load when the panel opens (D39).
const EpicPanel = lazy(() =>
  import('./epic-panel').then((module) => ({ default: module.EpicPanel }))
)

const RowMenu = lazy(() =>
  import('@/features/move-issue/row-menu').then((module) => ({
    default: module.RowMenu,
  }))
)

const DeleteIssueDialog = lazy(() =>
  import('@/features/delete-issue/delete-issue-dialog').then((module) => ({
    default: module.DeleteIssueDialog,
  }))
)

// Lazy: the forms (react-hook-form, zod, Radix dialog) load on the first sprint action (D39).
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

/** A section's lane: its sprint id, or `backlog` for the no-sprint section. */
const laneOf = (section: BacklogSection) =>
  String(section.sprint?.id ?? 'backlog')

const ACTION = 'h-11 md:h-9'

const startHint = (section: BacklogSection, running?: string) => {
  if (running) return `Complete ${running} before starting another.`
  if (section.issue_count === 0) return 'Add an issue before starting.'
  return undefined
}

type SectionsProps = {
  backlog: BacklogView
  projectKey: string
  statuses: Map<number, Status>
  /** Drawn beside the sections, inside the drag layer, so rows drop onto it. */
  panel: ReactNode
}

const Sections = ({ backlog, projectKey, statuses, panel }: SectionsProps) => {
  const narrow = useIsMobile()
  useAssignKey(
    () => backlog.sections.flatMap((section) => section.cards),
    useUpdateRow(projectKey)
  )
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<SprintAction | null>(null)
  // Held here, above the drag layer swap, so an open form survives it.
  const [creating, setCreating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Card | null>(null)
  const epics = useMemo(
    () => new Map(backlog.epics.map((epic) => [epic.key, epic])),
    [backlog.epics]
  )
  const running = backlog.sections.find(
    (section) => section.sprint?.state === 'active'
  )?.sprint

  const toggle = (lane: string) =>
    setCollapsed((old) => {
      const next = new Set(old)
      if (!next.delete(lane)) next.add(lane)
      return next
    })

  const renderRow = useCallback(
    (card: Card, handle: ReactNode) => (
      <BacklogRow
        card={card}
        projectKey={projectKey}
        epic={card.parent_key ? epics.get(card.parent_key) : undefined}
        status={statuses.get(card.status_id)}
        handle={handle}
        editable={!narrow}
        menu={
          <Suspense fallback={<MenuSlot />}>
            <RowMenu
              card={card}
              projectKey={projectKey}
              onDelete={setDeleting}
            />
          </Suspense>
        }
      />
    ),
    [projectKey, epics, statuses, narrow]
  )

  const open =
    (
      kind: 'edit' | 'delete' | 'start' | 'complete',
      section: BacklogSection,
      sprint: Sprint
    ) =>
    () =>
      setDialog({ kind, sprint, section })

  const sprintActions = (section: BacklogSection, sprint: Sprint) => {
    const hint = startHint(section, running?.name)
    return (
      <>
        {sprint.state === 'active' ? (
          <Button
            variant='outline'
            className={ACTION}
            onClick={open('complete', section, sprint)}
          >
            Complete sprint
          </Button>
        ) : (
          <Button
            variant='outline'
            className={ACTION}
            disabled={hint !== undefined}
            aria-describedby={hint && `section-${laneOf(section)}-hint`}
            onClick={open('start', section, sprint)}
          >
            Start sprint
          </Button>
        )}
        <Suspense fallback={<MenuSlot />}>
          <SprintMenu
            sprint={sprint}
            onEdit={open('edit', section, sprint)}
            onDelete={open('delete', section, sprint)}
          />
        </Suspense>
      </>
    )
  }

  const actionsOf = (section: BacklogSection) =>
    section.sprint ? (
      sprintActions(section, section.sprint)
    ) : (
      <Button
        variant='outline'
        className={ACTION}
        onClick={() => setDialog({ kind: 'create' })}
      >
        Create sprint
      </Button>
    )

  const renderSection = (section: BacklogSection, list: ReactNode) => {
    const lane = laneOf(section)
    const id = `section-${lane}`
    const visiblePoints = section.cards.reduce(
      (sum, card) => sum + (card.points ?? 0),
      0
    )
    const expanded = !collapsed.has(lane)
    return (
      <section
        key={lane}
        aria-labelledby={`${id}-title`}
        data-issue-group={section.sprint?.name ?? 'Backlog'}
        className='rounded-lg bg-muted'
      >
        <SectionHeader
          id={id}
          section={section}
          statuses={statuses}
          expanded={expanded}
          onToggle={() => toggle(lane)}
          onAddDates={(sprint) => setDialog({ kind: 'edit', sprint, section })}
          actions={actionsOf(section)}
          hint={
            section.sprint?.state === 'future'
              ? startHint(section, running?.name)
              : undefined
          }
        />
        <div id={`${id}-body`} hidden={!expanded} className='grid gap-2 pb-2'>
          {expanded && list}
          <CreateSlot
            projectKey={projectKey}
            sprintId={section.sprint?.id}
            open={creating === lane}
            setOpen={(open) => setCreating(open ? lane : null)}
          />
          <p className='px-4 text-xs text-subtle-foreground tabular-nums'>
            {section.cards.length} of {section.issue_count} issues visible ·
            Estimate: {visiblePoints} of {section.total_points}
          </p>
        </div>
      </section>
    )
  }

  const renderList = (
    section: BacklogSection,
    cards: Card[],
    renderItem: (card: Card) => ReactNode
  ) => (
    <RowList
      cards={cards}
      empty={
        section.sprint
          ? 'Drag issues here to plan this sprint.'
          : 'Create issues here, then drag them into a sprint.'
      }
      renderItem={renderItem}
    />
  )
  const plain = backlog.sections.map((section) =>
    renderSection(
      section,
      renderList(section, section.cards, (card) =>
        renderRow(card, <HandleSlot />)
      )
    )
  )

  const frame = (sections: ReactNode) => (
    <div className='flex items-start gap-4'>
      <div className='grid min-w-0 flex-1 gap-4'>{sections}</div>
      {panel}
    </div>
  )

  // Plain lists first; on wide screens the drag layer takes over with the same markup once its chunk loads.
  return (
    <BacklogContext value={backlog}>
      <RowEditorsProvider>
        {narrow ? (
          frame(plain)
        ) : (
          <Suspense fallback={frame(plain)}>
            <SortableBacklog
              backlog={backlog}
              projectKey={projectKey}
              frame={frame}
              renderSection={renderSection}
              renderList={renderList}
              renderRow={renderRow}
            />
          </Suspense>
        )}
      </RowEditorsProvider>
      {dialog && (
        <Suspense fallback={null}>
          <SprintDialog
            projectKey={projectKey}
            action={dialog}
            onClose={() => setDialog(null)}
          />
        </Suspense>
      )}
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
    </BacklogContext>
  )
}

/** Same boxes as the loaded backlog (filter bar, two sections), so nothing shifts when rows land (D39). */
const BacklogSkeleton = () => (
  <div role='status' aria-label='Loading backlog' className='grid gap-4'>
    <Skeleton className='h-11 w-64' />
    {[3, 4].map((rows) => (
      <div key={rows} className='grid gap-2 rounded-lg bg-muted p-2'>
        <Skeleton className='m-1 h-7 w-40' />
        {Array.from({ length: rows }, (_, row) => (
          <Skeleton key={row} className='h-11 bg-card' />
        ))}
      </div>
    ))}
  </div>
)

const BacklogBody = ({ projectKey, search }: BacklogProps) => {
  const { data: backlog, error } = useQuery({
    ...backlogQuery(projectKey, boardFilters(search)),
    placeholderData: keepPreviousData,
  })
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const statuses = useMemo(() => statusesById(settings), [settings])
  const navigate = useNavigate()
  if (error) throw error
  if (!backlog) return <BacklogSkeleton />
  const panelOpen = search.panel === 'epics'
  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        <FilterBar projectKey={projectKey} search={search} text />
        <Link
          to='.'
          search={(prev) => ({
            ...prev,
            panel: panelOpen ? undefined : 'epics',
          })}
          role='button'
          aria-pressed={panelOpen}
          className={`${TOGGLE} ms-auto gap-1.5`}
        >
          <Layers className='size-4' aria-hidden='true' />
          Epics
        </Link>
      </div>
      {backlog.sections.every((section) => section.cards.length === 0) &&
        (countFilters(search) > 0 ? (
          <p className='text-sm text-muted-foreground'>
            No issues match these filters.
          </p>
        ) : (
          <ImportHint projectKey={projectKey} />
        ))}
      <Sections
        backlog={backlog}
        projectKey={projectKey}
        statuses={statuses}
        panel={
          panelOpen && (
            <Suspense
              fallback={<div className='hidden w-72 shrink-0 md:block' />}
            >
              <EpicPanel
                epics={backlog.epics}
                projectKey={projectKey}
                selected={search.epic}
                onClose={() =>
                  void navigate({
                    to: '.',
                    search: (prev) => ({ ...prev, panel: undefined }),
                  })
                }
              />
            </Suspense>
          )
        }
      />
    </>
  )
}

export const Backlog = (props: BacklogProps) => (
  <div className='flex flex-col gap-3 px-4 py-4 sm:px-6'>
    <BacklogBody {...props} />
  </div>
)
