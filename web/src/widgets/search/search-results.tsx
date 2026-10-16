import { useMemo } from 'react'
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FilterBar } from '@/widgets/board/filter-bar'
import { boardSettingsQuery, issueNumber } from '@/entities/issue/board-query'
import { TypeGlyph } from '@/entities/issue/issue-glyphs'
import { TYPE_LABEL, isIssueType } from '@/entities/issue/labels'
import {
  type IssueSearch,
  searchFilters,
  searchQuery,
} from '@/entities/issue/search-query'
import { StatusPill } from '@/entities/issue/status-pill'
import {
  CATEGORY,
  type Category,
  type Status,
  statusesById,
} from '@/entities/issue/statuses'
import { timeAgo } from '@/entities/issue/time-ago'
import { membersQuery } from '@/entities/project/project-queries'
import type { Issue } from '@/shared/api/client'
import { initials } from '@/shared/lib/initials'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

type SearchResultsProps = { projectKey: string; search: IssueSearch }

const SELECT =
  'h-11 rounded-md border border-input bg-background px-2 text-base md:h-9 md:text-sm'

const CATEGORIES = Object.keys(CATEGORY).filter(
  (value): value is Category => value in CATEGORY
)

const capitalized = (text: string) => text[0].toUpperCase() + text.slice(1)

const FilterSelects = ({ search }: { search: IssueSearch }) => {
  const navigate = useNavigate({ from: '/p/$key/search' })
  return (
    <>
      <select
        aria-label='Type'
        value={search.type ?? ''}
        onChange={({ target }) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              type: isIssueType(target.value) ? target.value : undefined,
            }),
          })
        }
        className={SELECT}
      >
        <option value=''>Any type</option>
        {Object.entries(TYPE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label='Status'
        value={search.status ?? ''}
        onChange={({ target }) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              status: CATEGORIES.find((each) => each === target.value),
            }),
          })
        }
        className={SELECT}
      >
        <option value=''>Any status</option>
        {CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {capitalized(CATEGORY[category].label)}
          </option>
        ))}
      </select>
    </>
  )
}

type SearchRowProps = {
  issue: Issue
  projectKey: string
  status?: Status
  assignee?: string
}

const SearchRow = ({ issue, projectKey, status, assignee }: SearchRowProps) => (
  <li className='relative flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 bg-card px-3 py-2 text-sm hover:bg-muted md:flex-nowrap md:py-1.5'>
    <TypeGlyph type={issue.issue_type} />
    <span className='text-xs tracking-wide text-subtle-foreground tabular-nums'>
      {issue.key}
    </span>
    {/* IA §7: results open the issue dialog, the address bar showing the issue page. */}
    <Link
      to='.'
      search={(prev) => ({ ...prev, issue: issueNumber(issue.key) })}
      mask={{
        to: '/p/$key/issues/$number',
        params: { key: projectKey, number: String(issueNumber(issue.key)) },
      }}
      className='line-clamp-2 min-w-0 flex-1 basis-full outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring md:line-clamp-1 md:basis-auto'
    >
      {issue.summary}
    </Link>
    {status && <StatusPill status={status} />}
    {assignee && (
      <span
        className='grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[0.6875rem] font-bold text-primary'
        title={`Assigned to ${assignee}`}
      >
        {initials(assignee)}
      </span>
    )}
    <time
      dateTime={issue.updated_at}
      className='shrink-0 text-xs text-subtle-foreground'
    >
      {timeAgo(issue.updated_at)}
    </time>
  </li>
)

const ResultsSkeleton = () => (
  <div role='status' aria-label='Loading results' className='grid gap-px'>
    {[0, 1, 2, 3].map((row) => (
      <Skeleton key={row} className='h-11' />
    ))}
  </div>
)

const nothingFound = (q?: string) =>
  q
    ? `No issues match “${q}”. Try fewer words or clear filters.`
    : 'No issues match these filters.'

/** IA §7: matches by id, 50 per page; done issues included. */
export const SearchResults = ({ projectKey, search }: SearchResultsProps) => {
  const results = useInfiniteQuery({
    ...searchQuery(projectKey, searchFilters(search)),
    placeholderData: keepPreviousData,
  })
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const { data: members } = useQuery(membersQuery(projectKey))
  const statuses = useMemo(() => statusesById(settings), [settings])
  const names = useMemo(
    () =>
      new Map((members ?? []).map((each) => [each.user_id, each.display_name])),
    [members]
  )
  if (results.error) throw results.error

  // ponytail: the status category filters the loaded pages; a server-side `status` param when results get long.
  const issues = (results.data?.pages ?? [])
    .flatMap((each) => each.items)
    .filter(
      (issue) =>
        !search.status ||
        statuses.get(issue.status_id)?.category === search.status
    )

  return (
    <div className='grid gap-3'>
      <FilterBar
        projectKey={projectKey}
        search={search}
        filtered={Boolean(search.type || search.status)}
      >
        <FilterSelects search={search} />
      </FilterBar>
      {!results.data ? (
        <ResultsSkeleton />
      ) : issues.length === 0 ? (
        <p className='rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground'>
          {nothingFound(search.q)}
        </p>
      ) : (
        // ponytail: plain list; D39 virtualizes past 200 rows, reached here only after three "Show more".
        <ul className='grid gap-px overflow-hidden rounded-md border bg-border'>
          {issues.map((issue) => (
            <SearchRow
              key={issue.id}
              issue={issue}
              projectKey={projectKey}
              status={statuses.get(issue.status_id)}
              assignee={
                issue.assignee_id == null
                  ? undefined
                  : names.get(issue.assignee_id)
              }
            />
          ))}
        </ul>
      )}
      {results.hasNextPage && (
        <Button
          variant='outline'
          className='h-11 justify-self-center md:h-9'
          disabled={results.isFetchingNextPage}
          onClick={() => void results.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  )
}
