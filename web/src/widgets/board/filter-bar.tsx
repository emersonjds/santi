import type { ReactNode } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { BoardSearch } from '@/entities/issue/board-query'
import { membersQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import { UserAvatar } from '@/entities/user/user-avatar'

const TOGGLE =
  'inline-flex h-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground md:h-9'

const toggled = (ids: number[], id: number) =>
  ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]

const orNothing = (ids: number[]) => (ids.length > 0 ? ids : undefined)

type FilterBarProps = {
  projectKey: string
  search: BoardSearch
  /** Page-specific filters (search: type, status), drawn before Clear. */
  children?: ReactNode
  filtered?: boolean
}

/** D18: every filter is a link to the page URL with that filter flipped. */
export const FilterBar = ({
  projectKey,
  search,
  children,
  filtered = false,
}: FilterBarProps) => {
  const { data: members } = useSuspenseQuery(membersQuery(projectKey))
  const { data: me } = useSuspenseQuery(sessionQuery)
  const assignee = search.assignee ?? []
  const onlyMine = assignee.length === 1 && assignee[0] === me?.id
  // The current page: the board and the backlog share these filters (D18).
  const link = { to: '.' } as const

  return (
    <div
      role='group'
      aria-label='Filters'
      className='flex flex-wrap items-center gap-2'
    >
      <div className='flex max-w-full -space-x-1 overflow-x-auto p-0.5'>
        {members.map((member) => (
          <Link
            key={member.user_id}
            {...link}
            search={(prev) => ({
              ...prev,
              assignee: orNothing(toggled(assignee, member.user_id)),
            })}
            role='button'
            aria-pressed={assignee.includes(member.user_id)}
            aria-label={`Issues of ${member.display_name}`}
            className='shrink-0 rounded-full p-1 ring-2 ring-transparent outline-none hover:z-10 focus-visible:ring-ring aria-pressed:z-10 aria-pressed:ring-primary md:p-0.5'
          >
            <UserAvatar
              name={member.display_name}
              className='size-9 ring-2 ring-background md:size-8'
            />
          </Link>
        ))}
      </div>
      <Link
        {...link}
        search={(prev) => ({
          ...prev,
          assignee: onlyMine || !me ? undefined : [me.id],
        })}
        role='button'
        aria-pressed={onlyMine}
        className={TOGGLE}
      >
        Only my issues
      </Link>
      <Link
        {...link}
        search={(prev) => ({
          ...prev,
          recently_updated: search.recently_updated ? undefined : true,
        })}
        role='button'
        aria-pressed={search.recently_updated === true}
        className={TOGGLE}
      >
        Recently updated
      </Link>
      {children}
      {(filtered || assignee.length > 0 || search.recently_updated) && (
        <Link
          {...link}
          search={({ column, q }) => ({ column, q })}
          className='inline-flex h-11 items-center px-2 text-sm font-medium text-primary hover:underline md:h-9'
        >
          Clear filters
        </Link>
      )}
    </div>
  )
}
