import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { StarIssueButton } from '@/features/star/star-button'
import { groupByDay } from '@/entities/home/day-buckets'
import { myIssuesQuery } from '@/entities/home/home-queries'
import { TypeGlyph } from '@/entities/issue/issue-glyphs'
import { TYPE_LABEL } from '@/entities/issue/labels'
import { StatusPill } from '@/entities/issue/status-pill'
import { CATEGORY } from '@/entities/issue/statuses'
import { timeAgo } from '@/entities/issue/time-ago'
import { useTimeZone } from '@/entities/session/use-time-zone'
import { AssigneeAvatar } from '@/entities/user/user-avatar'
import type { HomeIssue, HomeView } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const EMPTY = {
  recommended: 'Issues you open, change, star or get assigned show up here.',
  assigned: 'Nothing open is assigned to you.',
  starred: 'Star an issue to keep it here.',
  worked: 'Issues you create, edit, move or comment on show up here.',
  viewed: 'Issues you open show up here.',
} satisfies Record<HomeView, string>

const number = (key: string) => key.slice(key.lastIndexOf('-') + 1)

const capitalized = (text: string) => text[0].toUpperCase() + text.slice(1)

const statusName = (issue: HomeIssue) =>
  capitalized(CATEGORY[issue.status_category].label)

const IssueRow = ({ issue }: { issue: HomeIssue }) => (
  <li className='group relative flex min-h-14 items-center gap-3 bg-card py-1 ps-3 pe-1 hover:bg-hover'>
    <TypeGlyph type={issue.issue_type} />
    <div className='grid min-w-0 flex-1'>
      <Link
        to='/p/$key/issues/$number'
        params={{ key: issue.project_key, number: number(issue.key) }}
        className={cn(
          'truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring',
          issue.status_category === 'done' && 'text-muted-foreground'
        )}
      >
        {issue.summary}
      </Link>
      <span className='truncate text-xs text-muted-foreground'>
        <span className='sm:hidden'>{statusName(issue)} • </span>
        {TYPE_LABEL[issue.issue_type]} • {issue.key} • {issue.project_name}
      </span>
    </div>
    <span className='hidden shrink-0 sm:block'>
      <StatusPill
        status={{ name: statusName(issue), category: issue.status_category }}
      />
    </span>
    {issue.assignee_name && <AssigneeAvatar name={issue.assignee_name} />}
    <time
      dateTime={issue.at}
      className='hidden w-24 shrink-0 text-end text-xs text-subtle-foreground min-[400px]:block'
    >
      {timeAgo(issue.at)}
    </time>
    <StarIssueButton issue={issue} />
  </li>
)

const ListSkeleton = () => (
  <div role='status' aria-label='Loading issues' className='grid gap-px'>
    {[0, 1, 2, 3, 4].map((row) => (
      <Skeleton key={row} className='h-14' />
    ))}
  </div>
)

/** One home tab: rows newest first under day headings, 50 at a time. */
export const IssueList = ({ view }: { view: HomeView }) => {
  const list = useInfiniteQuery(myIssuesQuery(view))
  const timeZone = useTimeZone()

  if (list.isError)
    return (
      <div
        role='alert'
        className='flex items-center justify-between gap-4 rounded-lg border px-4 py-3'
      >
        These issues did not load.
        <Button
          variant='outline'
          className='h-11 md:h-9'
          onClick={() => void list.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  if (!list.data) return <ListSkeleton />
  const issues = list.data.pages.flatMap((page) => page.items)
  if (issues.length === 0)
    return (
      <p className='rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground'>
        {EMPTY[view]}
      </p>
    )
  return (
    <div className='grid gap-5'>
      {/* ponytail: plain list; D39 virtualizes past 200 rows, reached only after four "Show more". */}
      {groupByDay(issues, timeZone).map(({ bucket, items }) => (
        <section key={bucket} aria-label={bucket} className='grid gap-2'>
          <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
            {bucket}
          </h3>
          <ul className='grid gap-px overflow-hidden rounded-md border bg-border'>
            {items.map((issue) => (
              <IssueRow key={issue.key} issue={issue} />
            ))}
          </ul>
        </section>
      ))}
      {list.hasNextPage && (
        <Button
          variant='outline'
          className='h-11 justify-self-center md:h-9'
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  )
}
