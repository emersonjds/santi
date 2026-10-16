import { Link } from '@tanstack/react-router'
import type { Sprint } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const DAY = 86_400_000

const timeLeft = (endDate: string) => {
  const today = new Date().setHours(0, 0, 0, 0)
  const days = Math.round((Date.parse(`${endDate}T00:00`) - today) / DAY)
  if (days > 1) return `${days} days left`
  if (days === 1) return '1 day left'
  return 'Ends today'
}

/** SB-11: name, time left and goal of the running sprint. */
export const SprintStrip = ({ sprint }: { sprint: Sprint }) => (
  <section
    aria-label='Active sprint'
    className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground'
  >
    <strong className='font-semibold text-foreground'>{sprint.name}</strong>
    {sprint.overdue ? (
      <span className='rounded-full bg-warning-bg px-2 text-xs font-semibold text-warning'>
        Overdue
      </span>
    ) : (
      sprint.end_date && <span>{timeLeft(sprint.end_date)}</span>
    )}
    {sprint.goal && <p className='line-clamp-2 basis-full'>{sprint.goal}</p>}
  </section>
)

export const NoSprint = ({ projectKey }: { projectKey: string }) => (
  <div className='grid justify-items-center gap-2 rounded-lg border border-dashed bg-muted px-5 py-10 text-center'>
    <p className='font-semibold'>No sprint is running.</p>
    <p className='max-w-[42ch] text-muted-foreground'>
      Plan one in the backlog and start it to see its issues here.
    </p>
    <Button asChild className='h-11 md:h-9'>
      <Link to='/p/$key/backlog' params={{ key: projectKey }}>
        Open backlog
      </Link>
    </Button>
  </div>
)

/** Same boxes as the loaded board (filter bar, three columns), so nothing shifts when cards land (D39). */
export const BoardSkeleton = () => (
  <div role='status' aria-label='Loading board' className='grid gap-3'>
    <Skeleton className='h-11 w-64' />
    <div className='flex gap-3 overflow-hidden'>
      {[0, 1, 2].map((column) => (
        <div
          key={column}
          className='grid w-full shrink-0 content-start gap-2 rounded-lg bg-muted p-2 md:w-72'
        >
          <Skeleton className='m-1 h-5 w-24' />
          <Skeleton className='h-22 bg-card' />
          <Skeleton className='h-22 bg-card' />
        </div>
      ))}
    </div>
  </div>
)
