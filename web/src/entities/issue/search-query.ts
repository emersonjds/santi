import { infiniteQueryOptions } from '@tanstack/react-query'
import { type IssueType, api, dataOrThrow } from '@/shared/api/client'
import { type BoardSearch, parseBoardSearch } from './board-query'
import { isIssueType } from './labels'
import { CATEGORY, type Category } from './statuses'

/** The search URL (IA §7): the text, the board's quick filters, a type and a status category. */
export type IssueSearch = Omit<BoardSearch, 'column'> & {
  q?: string
  type?: IssueType
  status?: Category
}

export type IssueSearchFilters = Omit<IssueSearch, 'issue' | 'status'>

const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && value in CATEGORY

export const parseIssueSearch = (
  search: Record<string, unknown>
): IssueSearch => {
  const { assignee, recently_updated, issue } = parseBoardSearch(search)
  const q = search.q === undefined ? '' : String(search.q).trim()
  return {
    q: q || undefined,
    type:
      typeof search.type === 'string' && isIssueType(search.type)
        ? search.type
        : undefined,
    status: isCategory(search.status) ? search.status : undefined,
    assignee,
    recently_updated,
    issue,
  }
}

/** What the server filters; the status category is applied to the loaded pages. */
export const searchFilters = ({
  q,
  type,
  assignee,
  recently_updated,
}: IssueSearch): IssueSearchFilters => ({ q, type, assignee, recently_updated })

const PAGE_SIZE = 50

export const searchQuery = (projectKey: string, filters: IssueSearchFilters) =>
  infiniteQueryOptions({
    queryKey: ['projects', projectKey, 'search', filters],
    queryFn: async ({ pageParam }) =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/issues', {
          params: {
            path: { key: projectKey },
            query: {
              ...filters,
              type: filters.type && [filters.type],
              limit: PAGE_SIZE,
              cursor: pageParam || undefined,
            },
          },
        })
      ),
    // Ids start at 1: cursor 0 is the first page.
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
