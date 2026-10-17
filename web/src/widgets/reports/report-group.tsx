import { useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Layers } from 'lucide-react'
import { issueNumber } from '@/entities/issue/board-query'
import { PriorityGlyph, TypeGlyph } from '@/entities/issue/issue-glyphs'
import { StatusPill } from '@/entities/issue/status-pill'
import { formatPoints } from '@/entities/report/report-queries'
import type { ReportGroup, ReportIssue } from '@/shared/api/client'
import { LongRows } from '@/shared/lib/long-rows'
import { Button } from '@/shared/ui/button'

const TITLES = {
  completed: 'Completed',
  not_completed: 'Not completed',
  removed: 'Removed from sprint',
} satisfies Record<ReportGroup['outcome'], string>

const FIRST_ROWS = 50

const pointsRange = (start?: number | null, end?: number | null) =>
  `${formatPoints(start)} → ${formatPoints(end)}`

const Added = () => (
  <>
    <span
      aria-hidden='true'
      className='rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground'
    >
      Added
    </span>
    <span className='sr-only'>Added after the sprint started</span>
  </>
)

type ReportRowProps = { issue: ReportIssue; projectKey: string }

/** Stacked at 375px, one line from `sm`; the key opens the issue over the report (IA §6). */
const ReportRow = ({ issue, projectKey }: ReportRowProps) => (
  <div className='relative flex min-h-11 flex-col gap-1 bg-card px-3 py-2 text-sm hover:bg-hover sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-x-3 sm:py-1.5'>
    <span className='flex items-center gap-2'>
      <TypeGlyph type={issue.issue_type} />
      <Link
        to='.'
        search={(prev) => ({ ...prev, issue: issueNumber(issue.key) })}
        mask={{
          to: '/p/$key/issues/$number',
          params: { key: projectKey, number: String(issueNumber(issue.key)) },
        }}
        className='text-xs tracking-wide whitespace-nowrap text-subtle-foreground tabular-nums outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-4 focus-visible:after:outline-ring'
      >
        {issue.key}
      </Link>
    </span>
    <span className='line-clamp-2 min-w-0 sm:line-clamp-1'>
      {issue.summary}
    </span>
    <span className='flex flex-wrap items-center gap-2'>
      {issue.added_after_start && <Added />}
      {issue.epic_summary && (
        <span
          className='inline-flex min-w-0 items-center gap-1 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground sm:max-w-40'
          title={`Epic ${issue.epic_summary}`}
        >
          <Layers
            className='size-3.5 shrink-0 text-type-epic'
            aria-hidden='true'
          />
          <span className='sr-only'>Epic </span>
          <span className='truncate'>{issue.epic_summary}</span>
        </span>
      )}
      <StatusPill
        status={{ name: issue.status_name, category: issue.status_category }}
      />
      <PriorityGlyph priority={issue.priority} />
      <span className='whitespace-nowrap tabular-nums'>
        <span className='sr-only'>Points </span>
        {pointsRange(issue.points_at_start, issue.points_at_end)}
      </span>
    </span>
  </div>
)

type ReportGroupSectionProps = { group: ReportGroup; projectKey: string }

/** One outcome of the sprint (RP-27): its totals, its rows and the deleted work as one muted line (D40). */
export const ReportGroupSection = ({
  group,
  projectKey,
}: ReportGroupSectionProps) => {
  const titleId = useId()
  const [showAll, setShowAll] = useState(false)
  const title = TITLES[group.outcome]
  const shown = showAll ? group.issues : group.issues.slice(0, FIRST_ROWS)
  const empty = group.issues.length === 0 && !group.deleted
  return (
    <section aria-labelledby={titleId} className='grid gap-2'>
      <div className='flex items-baseline justify-between gap-3 text-sm'>
        <h2 id={titleId} className='font-semibold'>
          {title}
        </h2>
        <span className='text-muted-foreground tabular-nums'>
          {pointsRange(group.points_at_start, group.points_at_end)} points
        </span>
      </div>
      {empty ? (
        <p className='rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground'>
          No issues
        </p>
      ) : (
        <div className='grid gap-px overflow-hidden rounded-md border bg-border'>
          {shown.length > 0 && (
            <ul aria-label={title} className='grid gap-px'>
              <LongRows
                items={shown}
                itemKey={(issue) => issue.key}
                renderItem={(issue) => (
                  <ReportRow issue={issue} projectKey={projectKey} />
                )}
              />
            </ul>
          )}
          {group.deleted && (
            <p className='flex min-h-11 items-center justify-between gap-3 bg-card px-3 py-2 text-sm text-muted-foreground'>
              Deleted issues
              <span className='tabular-nums'>
                {pointsRange(
                  group.deleted.points_at_start,
                  group.deleted.points_at_end
                )}
              </span>
            </p>
          )}
        </div>
      )}
      {shown.length < group.issues.length && (
        <Button
          variant='outline'
          className='h-11 justify-self-center md:h-9'
          onClick={() => setShowAll(true)}
        >
          Show all {group.issues.length}
        </Button>
      )}
    </section>
  )
}
