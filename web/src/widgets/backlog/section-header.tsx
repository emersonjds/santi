import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { issueCount } from '@/entities/issue/labels'
import { CATEGORY, type Category, type Status } from '@/entities/issue/statuses'
import type { BacklogSection, Sprint } from '@/shared/api/client'
import { lockedButton, useReadOnly } from '@/shared/lib/read-only'
import { cn } from '@/shared/lib/utils'

const day = (date: string) =>
  new Date(`${date}T00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

const BADGE = 'rounded-full px-2 py-0.5 text-xs font-semibold'

const Chip = ({ category, count }: { category: Category; count: number }) => {
  const { icon: Icon, label, tone } = CATEGORY[category]
  return (
    <span
      className={cn('inline-flex items-center gap-1 tabular-nums', BADGE, tone)}
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
    >
      <Icon className='size-3.5' aria-hidden='true' />
      {count}
    </span>
  )
}

/** Status chips of the rows shown; done only when some are (the backlog hides done work, BL-2). */
const Chips = ({
  section,
  statuses,
}: {
  section: BacklogSection
  statuses: Map<number, Status>
}) => {
  const counts = { todo: 0, in_progress: 0, done: 0 }
  for (const card of section.cards) {
    const category = statuses.get(card.status_id)?.category
    if (category) counts[category] += 1
  }
  return (
    <>
      <Chip category='todo' count={counts.todo} />
      <Chip category='in_progress' count={counts.in_progress} />
      {counts.done > 0 && <Chip category='done' count={counts.done} />}
    </>
  )
}

const Dates = ({
  sprint,
  onAddDates,
}: {
  sprint: Sprint
  onAddDates: (sprint: Sprint) => void
}) => {
  const note = useReadOnly()
  return sprint.start_date && sprint.end_date ? (
    <span className='text-sm text-muted-foreground'>
      {day(sprint.start_date)} – {day(sprint.end_date)}
    </span>
  ) : (
    <button
      type='button'
      className='h-11 rounded-md px-1 text-sm text-primary hover:underline aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:no-underline md:h-9'
      onClick={() => onAddDates(sprint)}
      {...lockedButton(note)}
    >
      Add dates
    </button>
  )
}

type SectionHeaderProps = {
  id: string
  section: BacklogSection
  statuses: Map<number, Status>
  expanded: boolean
  onToggle: () => void
  onAddDates: (sprint: Sprint) => void
  actions: ReactNode
  hint?: string
}

/** IA §4: name, dates, badges, count, status chips, points (D11), then the section's actions. */
export const SectionHeader = ({
  id,
  section,
  statuses,
  expanded,
  onToggle,
  onAddDates,
  actions,
  hint,
}: SectionHeaderProps) => {
  const { sprint } = section
  return (
    <header className='flex flex-wrap items-center gap-x-3 gap-y-1 p-2'>
      <h2 id={`${id}-title`} className='min-w-0'>
        <button
          type='button'
          aria-expanded={expanded}
          aria-controls={`${id}-body`}
          onClick={onToggle}
          className='group flex h-11 max-w-full items-center gap-1.5 rounded-md px-2 font-semibold outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring md:h-9'
        >
          <ChevronDown
            aria-hidden='true'
            className='size-4 shrink-0 text-muted-foreground transition-transform group-aria-[expanded=false]:-rotate-90 motion-reduce:transition-none'
          />
          <span className='truncate'>{sprint?.name ?? 'Backlog'}</span>
        </button>
      </h2>
      {sprint?.state === 'active' && (
        <span className={cn(BADGE, 'bg-accent text-accent-foreground')}>
          Active
        </span>
      )}
      {sprint?.overdue && (
        <span className={cn(BADGE, 'bg-warning-bg text-warning')}>Overdue</span>
      )}
      {sprint && <Dates sprint={sprint} onAddDates={onAddDates} />}
      <span className='text-sm text-muted-foreground'>
        {issueCount(section.issue_count)}
      </span>
      <span className='ms-auto flex flex-wrap items-center gap-1.5'>
        <Chips section={section} statuses={statuses} />
        <span
          className={cn(BADGE, 'bg-background tabular-nums')}
          aria-label={`Total ${section.total_points} points`}
          title={`Total ${section.total_points} points`}
        >
          {section.total_points}
          <span className='font-normal text-muted-foreground'> pts</span>
        </span>
      </span>
      <span className='flex items-center gap-1'>{actions}</span>
      {hint && (
        <p
          id={`${id}-hint`}
          className='basis-full px-2 text-xs text-subtle-foreground md:text-end'
        >
          {hint}
        </p>
      )}
      {sprint?.goal && (
        <p className='line-clamp-2 basis-full px-2 text-sm text-muted-foreground'>
          {sprint.goal}
        </p>
      )}
    </header>
  )
}
