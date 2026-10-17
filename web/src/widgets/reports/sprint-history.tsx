import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  formatPoints,
  sprintHistoryQuery,
} from '@/entities/report/report-queries'
import type { SprintTotals } from '@/shared/api/client'
import { day } from '@/shared/lib/sprint-dates'
import { Button } from '@/shared/ui/button'
import { LoadFailed } from '@/shared/ui/load-failed'
import { Skeleton } from '@/shared/ui/skeleton'

const Total = ({
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

/** Stacked at 375px; from `sm` the totals take a column of their own. */
const SprintRow = ({ totals }: { totals: SprintTotals }) => {
  const { sprint } = totals
  return (
    <li className='flex min-h-11 flex-col gap-1 bg-card px-3 py-2 text-sm sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-6'>
      <div className='grid min-w-0 gap-0.5'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <span className='font-medium'>{sprint.name}</span>
          {sprint.state === 'active' && (
            <span className='rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground'>
              In progress
            </span>
          )}
          {sprint.start_date && sprint.end_date && (
            <span className='text-muted-foreground'>
              {day(sprint.start_date)} – {day(sprint.end_date)}
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
    <section aria-label='Sprints' className='grid gap-3'>
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
        <ul
          aria-label='Sprints'
          className='grid gap-px overflow-hidden rounded-md border bg-border'
        >
          {sprints.map((totals) => (
            <SprintRow key={totals.sprint.id} totals={totals} />
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
