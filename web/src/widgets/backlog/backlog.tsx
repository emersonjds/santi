import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FilterBar } from '@/widgets/board/filter-bar'
import { backlogQuery } from '@/entities/issue/backlog-query'
import {
  type BoardSearch,
  boardFilters,
  boardSettingsQuery,
} from '@/entities/issue/board-query'
import { type Status, statusesById } from '@/entities/issue/status-pill'
import type {
  Backlog as BacklogView,
  BacklogSection,
  Card,
} from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { BacklogRow, HandleSlot } from './backlog-row'
import { RowList } from './row-list'
import { SectionHeader } from './section-header'

type BacklogProps = { projectKey: string; search: BoardSearch }

/** A section's lane: its sprint id, or `backlog` for the no-sprint section. */
export const laneOf = (section: BacklogSection) =>
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
}

const Sections = ({ backlog, projectKey, statuses }: SectionsProps) => {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
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
        menu={null}
      />
    ),
    [projectKey, epics, statuses]
  )

  const actionsOf = (section: BacklogSection) => {
    const { sprint } = section
    if (!sprint)
      return (
        <Button variant='outline' className={ACTION}>
          Create sprint
        </Button>
      )
    if (sprint.state === 'active')
      return (
        <Button variant='outline' className={ACTION}>
          Complete sprint
        </Button>
      )
    const hint = startHint(section, running?.name)
    return (
      <Button
        variant='outline'
        className={ACTION}
        disabled={hint !== undefined}
        aria-describedby={hint && `section-${laneOf(section)}-hint`}
      >
        Start sprint
      </Button>
    )
  }

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
        className='rounded-lg bg-muted'
      >
        <SectionHeader
          id={id}
          section={section}
          statuses={statuses}
          expanded={expanded}
          onToggle={() => toggle(lane)}
          onAddDates={() => {}}
          actions={actionsOf(section)}
          hint={
            section.sprint?.state === 'future'
              ? startHint(section, running?.name)
              : undefined
          }
        />
        <div id={`${id}-body`} hidden={!expanded} className='grid gap-2 pb-2'>
          {expanded && list}
          <p className='px-4 text-xs text-subtle-foreground tabular-nums'>
            {section.cards.length} of {section.issue_count} issues visible ·
            Estimate: {visiblePoints} of {section.total_points}
          </p>
        </div>
      </section>
    )
  }

  const renderList = (section: BacklogSection) => (
    <RowList
      cards={section.cards}
      empty={
        section.sprint
          ? 'Drag issues here to plan this sprint.'
          : 'Create issues here, then drag them into a sprint.'
      }
      renderItem={(card) => renderRow(card, <HandleSlot />)}
    />
  )

  return (
    <div className='grid gap-4'>
      {backlog.sections.map((section) =>
        renderSection(section, renderList(section))
      )}
    </div>
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
  if (error) throw error
  if (!backlog) return <BacklogSkeleton />
  const filtered = search.assignee || search.recently_updated

  return (
    <>
      <FilterBar projectKey={projectKey} search={search} />
      {filtered &&
        backlog.sections.every((section) => section.cards.length === 0) && (
          <p className='text-sm text-muted-foreground'>
            No issues match these filters.
          </p>
        )}
      <Sections backlog={backlog} projectKey={projectKey} statuses={statuses} />
    </>
  )
}

export const Backlog = (props: BacklogProps) => (
  <div className='flex flex-col gap-3 px-4 py-4 sm:px-6'>
    <BacklogBody {...props} />
  </div>
)
