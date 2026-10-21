import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { PersonRow } from '@/widgets/people/person-row'
import { peopleQuery, projectQuery } from '@/entities/project/project-queries'
import { useTimeZone } from '@/entities/session/use-time-zone'
import type { Sprint } from '@/shared/api/client'
import { formatRange } from '@/shared/lib/sprint-dates'
import { Button } from '@/shared/ui/button'
import { LoadFailed } from '@/shared/ui/load-failed'
import { Skeleton } from '@/shared/ui/skeleton'

const ROW =
  'grid gap-1.5 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-x-6'

/** Same height as the loaded rows (D39). */
const PeopleSkeleton = () => (
  <div
    role='status'
    aria-label='Loading people'
    className='divide-y rounded-md border bg-card'
  >
    {[0, 1, 2, 3, 4].map((row) => (
      <div key={row} className={ROW}>
        <div className='flex items-center gap-2'>
          <Skeleton className='size-7 rounded-full' />
          <Skeleton className='h-4 w-32' />
          <Skeleton className='ms-auto h-4 w-28' />
        </div>
        <Skeleton className='h-2 rounded-full' />
      </div>
    ))}
  </div>
)

const Notice = ({ children }: { children: ReactNode }) => (
  <div className='grid justify-items-center gap-2 rounded-lg border border-dashed bg-muted px-5 py-10 text-center'>
    {children}
  </div>
)

const SprintLine = ({ sprint }: { sprint: Sprint }) => {
  const timeZone = useTimeZone()
  return (
    <>
      {sprint.name}
      {sprint.starts_at &&
        sprint.ends_at &&
        ` · ${formatRange(sprint.starts_at, sprint.ends_at, undefined, timeZone)}`}
    </>
  )
}

export const PeoplePage = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key/people' })
  const people = useQuery(peopleQuery(key))
  const { data: project } = useQuery(projectQuery(key))
  const scrum = project?.board_type === 'scrum'
  const sprint = people.data?.sprint

  const body = () => {
    if (people.isError)
      return (
        <LoadFailed
          message='People did not load.'
          action='Try again'
          onRetry={() => void people.refetch()}
        />
      )
    if (!people.data || !project) return <PeopleSkeleton />
    if (scrum && !sprint)
      return (
        <Notice>
          <p className='font-semibold'>No sprint is running.</p>
          <Button asChild className='h-11 md:h-9'>
            <Link to='/p/$key/backlog' params={{ key }}>
              Go to Backlog
            </Link>
          </Button>
        </Notice>
      )
    if (
      people.data.people.every(
        ({ to_do, in_progress, done }) =>
          to_do.issues + in_progress.issues + done.issues === 0
      )
    )
      return (
        <Notice>
          <p className='font-semibold'>
            {scrum
              ? 'This sprint has no issues yet.'
              : 'The board has no issues yet.'}
          </p>
        </Notice>
      )
    return (
      <ul aria-label='People' className='divide-y rounded-md border bg-card'>
        {people.data.people.map((person) => (
          <PersonRow
            key={person.user_id ?? 'unassigned'}
            person={person}
            projectKey={key}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className='mx-auto flex w-full max-w-[68.75rem] flex-col gap-4 px-4 py-4 sm:px-6'>
      <header className='sticky top-0 z-10 grid gap-0.5 bg-background py-1'>
        <h1 className='text-xl font-semibold tracking-tight'>People</h1>
        <p className='min-h-5 text-sm text-muted-foreground'>
          {sprint ? (
            <SprintLine sprint={sprint} />
          ) : (
            project?.board_type === 'kanban' && 'Kanban board'
          )}
        </p>
      </header>
      {body()}
    </div>
  )
}
