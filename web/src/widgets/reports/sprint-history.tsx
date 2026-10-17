import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  formatPoints,
  sprintHistoryQuery,
} from '@/entities/report/report-queries'
import type { SprintTotals } from '@/shared/api/client'
import { formatRange } from '@/shared/lib/sprint-dates'
import { Button } from '@/shared/ui/button'
import { LoadFailed } from '@/shared/ui/load-failed'
import { Skeleton } from '@/shared/ui/skeleton'

export const Total = ({
  label,
  points,
}: {
  label: string
  points?: number | null
}) => (
  <span className='flex gap-1'>
    <span className='text-muted-foreground'>{label}</span>
    <span className='font-medium'>{formatPoints(points)}</span>
  </span>
)

export const InProgress = () => (
  <span className='rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground'>
    In progress
  </span>
)

type SprintRowProps = { totals: SprintTotals; projectKey: string }

/** Stacked at 375px; from `sm` the totals take a column of their own. The name's link covers the row. */
const SprintRow = ({ totals, projectKey }: SprintRowProps) => {
  const { sprint } = totals
  return (
    <li className='relative flex min-h-11 flex-col gap-1 bg-card px-3 py-2 text-sm hover:bg-hover sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-6'>
      <div className='grid min-w-0 gap-0.5'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <Link
            to='/p/$key/reports/$id'
            params={{ key: projectKey, id: String(sprint.id) }}
            className='font-medium outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-4 focus-visible:after:outline-ring'
          >
            {sprint.name}
          </Link>
          {sprint.state === 'active' && <InProgress />}
          {sprint.starts_at && sprint.ends_at && (
            <span className='text-muted-foreground'>
              {formatRange(sprint.starts_at, sprint.ends_at)}
            </span>
          )}
        </div>
        {sprint.goal && (
          <p className='truncate text-muted-foreground' title={sprint.goal}>
            {sprint.goal}
          </p>
        )}
      </div>
      <span className='flex gap-4 tabular-nums'>
        <Total label='Committed' points={totals.committed} />
        <Total label='Completed' points={totals.completed} />
      </span>
    </li>
  )
}

const HistorySkeleton = () => (
  <div role='status' aria-label='Loading sprints' className='grid gap-px'>
    {[0, 1, 2].map((row) => (
      <Skeleton key={row} className='h-14' />
    ))}
  </div>
)

const NoSprints = ({ projectKey }: { projectKey: string }) => (
  <div className='flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'>
    <p>No sprint has finished yet.</p>
    <Button asChild variant='outline' className='h-11'>
      <Link to='/p/$key/backlog' params={{ key: projectKey }}>
        Go to Backlog
      </Link>
    </Button>
  </div>
)

/** Started sprints, 50 per page (D29); the server puts the active one first. */
export const SprintHistory = ({ projectKey }: { projectKey: string }) => {
  const history = useInfiniteQuery(sprintHistoryQuery(projectKey))
  const sprints = (history.data?.pages ?? []).flatMap((each) => each.items)
  return (
    <section aria-labelledby='sprints-title' className='grid gap-2'>
      <h2
        id='sprints-title'
        className='text-sm font-semibold text-muted-foreground'
      >
        Sprints
      </h2>
      {history.isError ? (
        <LoadFailed
          message="Couldn't load reports."
          onRetry={() => void history.refetch()}
        />
      ) : !history.data ? (
        <HistorySkeleton />
      ) : sprints.length === 0 ? (
        <NoSprints projectKey={projectKey} />
      ) : (
        // ponytail: plain list; D39 virtualizes past 200 rows, reached only after four "Show more".
        <ul className='grid gap-px overflow-hidden rounded-md border bg-border'>
          {sprints.map((totals) => (
            <SprintRow
              key={totals.sprint.id}
              totals={totals}
              projectKey={projectKey}
            />
          ))}
        </ul>
      )}
      {history.hasNextPage && !history.isError && (
        <Button
          variant='outline'
          className='h-11 justify-self-center md:h-9'
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </section>
  )
}
