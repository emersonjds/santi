import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  boardQuery,
  boardSettingsQuery,
  issueNumber,
} from '@/entities/issue/board-query'
import { StatusPill } from '@/entities/issue/status-pill'
import { statusesById } from '@/entities/issue/statuses'
import { daysSince } from '@/entities/issue/time-ago'
import {
  PersonName,
  UnassignedAvatar,
  UserAvatar,
} from '@/entities/user/user-avatar'
import type { PersonProgress } from '@/shared/api/client'
import { fullName } from '@/shared/lib/initials'
import { LoadFailed } from '@/shared/ui/load-failed'
import { Skeleton } from '@/shared/ui/skeleton'

// The server's stuck rule (SAN-173): in progress with no update for 3 days or more.
const STUCK_DAYS = 3

const SEGMENTS = [
  ['to_do', 'bg-status-todo'],
  ['in_progress', 'bg-status-progress'],
  ['done', 'bg-status-done'],
] as const

const issueTotal = ({ to_do, in_progress, done }: PersonProgress) =>
  to_do.issues + in_progress.issues + done.issues

type PersonProps = { person: PersonProgress; projectKey: string }

const PersonIssues = ({
  person,
  projectKey,
  name,
  id,
}: PersonProps & { name: string; id: string }) => {
  const filters =
    person.user_id == null
      ? { unassigned: true }
      : { assignee: [person.user_id] }
  const board = useQuery(boardQuery(projectKey, filters))
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const statuses = statusesById(settings)
  if (board.isError)
    return (
      <LoadFailed
        message='Issues did not load.'
        action='Try again'
        onRetry={() => void board.refetch()}
      />
    )
  if (!board.data) return <Skeleton className='mx-3 mb-2 h-11' />
  return (
    <div className='grid gap-1 px-3 pb-2'>
      <ul id={id} aria-label={`Issues of ${name}`} className='grid'>
        {board.data.columns
          .flatMap((column) => column.cards)
          .map((card) => {
            const status = statuses.get(card.status_id)
            const days = daysSince(card.updated_at)
            const stuck =
              status?.category === 'in_progress' && days >= STUCK_DAYS
            return (
              <li key={card.id}>
                <Link
                  to='/p/$key/issues/$number'
                  params={{
                    key: projectKey,
                    number: String(issueNumber(card.key)),
                  }}
                  className='grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-sm hover:bg-hover sm:flex sm:py-0'
                >
                  <span className='shrink-0 text-muted-foreground'>
                    {card.key}
                  </span>
                  <span className='min-w-0 flex-1 truncate'>
                    {card.summary}
                  </span>
                  <span className='col-start-2 flex min-w-0 items-center gap-2 sm:contents'>
                    {status && <StatusPill status={status} />}
                    {stuck && (
                      <span className='shrink-0 text-xs text-muted-foreground'>
                        {days} days since update
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
      </ul>
      <Link
        to='/p/$key/board'
        params={{ key: projectKey }}
        search={filters}
        className='inline-flex min-h-11 items-center self-start px-2 text-sm font-medium text-primary hover:underline'
      >
        Show on board
      </Link>
    </div>
  )
}

/** One person: a disclosure button over their counts, their issues listed in place once open. */
export const PersonRow = ({ person, projectKey }: PersonProps) => {
  const [open, setOpen] = useState(false)
  const id = useId()
  const name = person.name ? fullName(person.name) : 'Unassigned'
  const { to_do, in_progress, done } = person
  const points = to_do.points + in_progress.points + done.points
  return (
    <li>
      <button
        type='button'
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className='grid min-h-11 w-full gap-1.5 px-3 py-2 text-start text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-x-6'
      >
        <span data-slot='name' className='flex min-w-0 items-center gap-2'>
          <span aria-hidden='true' className='shrink-0'>
            {person.name ? (
              <UserAvatar name={person.name} className='size-7' />
            ) : (
              <UnassignedAvatar className='size-7' />
            )}
          </span>
          {person.name ? (
            <PersonName name={person.name} className='truncate font-medium' />
          ) : (
            <span className='truncate font-medium'>Unassigned</span>
          )}
          {person.stuck > 0 && (
            <span
              title={`No update in ${STUCK_DAYS} or more days`}
              className='shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive'
            >
              Stuck ×{person.stuck}
            </span>
          )}
        </span>
        <span className='order-1 text-muted-foreground tabular-nums sm:order-none'>
          {done.issues}/{issueTotal(person)} issues · {done.points}/{points} pts
        </span>
        <span
          data-slot='bar'
          aria-hidden='true'
          className='flex h-2 overflow-hidden rounded-full bg-muted'
        >
          {SEGMENTS.map(
            ([category, tone]) =>
              person[category].issues > 0 && (
                <span
                  key={category}
                  className={`basis-0 ${tone}`}
                  style={{ flexGrow: person[category].issues }}
                />
              )
          )}
        </span>
        <span className='sr-only'>
          {to_do.issues} to do, {in_progress.issues} in progress, {done.issues}{' '}
          done
        </span>
      </button>
      {open && (
        <PersonIssues
          person={person}
          projectKey={projectKey}
          name={name}
          id={id}
        />
      )}
    </li>
  )
}
