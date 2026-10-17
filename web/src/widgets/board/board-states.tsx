import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { SprintCountdown } from '@/entities/sprint/sprint-countdown'
import type { Sprint } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { COLUMN_WIDTH } from './board-column'

/** SB-11: name, time left and goal of the running sprint; its "…" menu on the same line (R-4). */
export const SprintStrip = ({
  sprint,
  menu,
}: {
  sprint: Sprint
  menu?: ReactNode
}) => (
  <section
    aria-label='Active sprint'
    className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground'
  >
    <strong className='font-semibold text-foreground'>{sprint.name}</strong>
    <SprintCountdown sprint={sprint} />
    <span className='ms-auto'>{menu}</span>
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

const CARD = 'h-22 border bg-card'

/** Same boxes as the loaded board (sprint line, filter bar, columns), so nothing shifts when cards land (D39). */
export const BoardSkeleton = ({ scrum }: { scrum: boolean }) => (
  <div role='status' aria-label='Loading board' className='grid gap-3'>
    {scrum && (
      <div className='grid gap-1'>
        <Skeleton className='h-5 w-48' />
        <Skeleton className='h-5 w-full max-w-xl' />
      </div>
    )}
    <Skeleton className='h-11 w-24 md:h-9 md:w-full md:max-w-2xl' />
    <Skeleton className='h-11 w-64 rounded-full md:hidden' />
    <div className='flex gap-3 overflow-hidden'>
      {[0, 1, 2].map((column) => (
        <div
          key={column}
          className={`grid content-start gap-2 rounded-lg bg-muted px-2 pt-3 pb-2 ${COLUMN_WIDTH}`}
        >
          <Skeleton className='mx-1 h-4 w-24' />
          <Skeleton className={CARD} />
          <Skeleton className={CARD} />
        </div>
      ))}
    </div>
  </div>
)
