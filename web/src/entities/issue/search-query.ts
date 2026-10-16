import { infiniteQueryOptions } from '@tanstack/react-query'
import { api, dataOrThrow } from '@/shared/api/client'
import {
  type BoardFilters,
  type BoardSearch,
  boardFilters,
  parseBoardSearch,
} from './board-query'
import { CATEGORY, type Category } from './statuses'

/** The search URL (IA §7): the text, the board's quick filters and a status category. */
export type IssueSearch = Omit<BoardSearch, 'column'> & { status?: Category }

export type IssueSearchFilters = BoardFilters & { status?: Category[] }

const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && Object.hasOwn(CATEGORY, value)

export const parseIssueSearch = (
  search: Record<string, unknown>
): IssueSearch => {
  const { column: _, ...board } = parseBoardSearch(search)
  return {
    ...board,
    status: isCategory(search.status) ? search.status : undefined,
  }
}

export const searchFilters = (search: IssueSearch): IssueSearchFilters => ({
  ...boardFilters(search),
  status: search.status && [search.status],
})

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
