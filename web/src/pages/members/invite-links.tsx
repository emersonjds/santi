import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RevokeInviteButton } from '@/features/revoke-invite/revoke-invite-button'
import { invitesQuery } from '@/entities/invite/invite-queries'
import { commentTime } from '@/entities/issue/comment-time'
import { timeAgo } from '@/entities/issue/time-ago'
import { ROLE_LABEL } from '@/entities/project/labels'
import { useTimeZone } from '@/entities/session/session-query'
import type { InviteInfo } from '@/shared/api/client'
import { ReadOnly } from '@/shared/lib/read-only'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const spots = ({ uses, max_uses }: InviteInfo) =>
  `${uses} of ${max_uses} ${max_uses === 1 ? 'spot' : 'spots'} used`

const InviteRow = ({
  projectKey,
  invite,
}: {
  projectKey: string
  invite: InviteInfo
}) => {
  const summary = `invite-${invite.id}`
  const timeZone = useTimeZone()
  const row = useRef<HTMLLIElement>(null)
  const nextFocus = () => {
    const revoke = (element: Element | null | undefined) =>
      element?.querySelector<HTMLElement>('button')
    return (
      revoke(row.current?.nextElementSibling) ??
      revoke(row.current?.previousElementSibling) ??
      document.getElementById('invite-links')
    )
  }
  return (
    <li ref={row} className='grid gap-2 bg-card px-3 py-2'>
      <div className='flex flex-wrap items-center gap-3'>
        <span
          id={summary}
          className='flex min-w-48 flex-1 flex-wrap gap-x-3 gap-y-1 text-sm'
        >
          <span className='font-medium'>{ROLE_LABEL[invite.role]}</span>
          <span>{spots(invite)}</span>
          <span className='text-muted-foreground'>
            expires {timeAgo(invite.expires_at)}
          </span>
          <span className='text-muted-foreground'>
            by {invite.created_by_name}
          </span>
        </span>
        <RevokeInviteButton
          projectKey={projectKey}
          inviteId={invite.id}
          describedBy={summary}
          nextFocus={nextFocus}
        />
      </div>
      {invite.joined.length > 0 && (
        <ul aria-label='Joined with this link' className='grid gap-1 text-sm'>
          {invite.joined.map((person) => (
            <li key={person.user_id} className='flex flex-wrap gap-x-3'>
              <span className='font-medium'>{person.name}</span>
              <span className='break-all text-muted-foreground'>
                {person.email}
              </span>
              <time
                dateTime={person.joined_at}
                className='text-muted-foreground'
              >
                {commentTime(person.joined_at, timeZone)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** SAN-177: live invite links under the members list, each with who joined. */
export const InviteLinks = ({ projectKey }: { projectKey: string }) => {
  const { data: invites, isError, refetch } = useQuery(invitesQuery(projectKey))

  return (
    <section aria-labelledby='invite-links' className='grid gap-3'>
      <h2 id='invite-links' tabIndex={-1} className='text-lg font-semibold'>
        Invite links
      </h2>
      {isError ? (
        // A read: the retry stays live in an archived project.
        <ReadOnly value={undefined}>
          <div
            role='alert'
            className='flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2'
          >
            Invite links did not load.
            <Button
              variant='outline'
              className='h-11 md:h-9'
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        </ReadOnly>
      ) : !invites ? (
        <div
          role='status'
          aria-label='Loading invite links'
          className='grid gap-px'
        >
          <Skeleton className='h-16' />
          <Skeleton className='h-16' />
        </div>
      ) : invites.length === 0 ? (
        <p className='rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground'>
          No active invite links.
        </p>
      ) : (
        <ul
          aria-labelledby='invite-links'
          className='grid gap-px overflow-hidden rounded-md border bg-border'
        >
          {invites.map((invite) => (
            <InviteRow
              key={invite.id}
              projectKey={projectKey}
              invite={invite}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
