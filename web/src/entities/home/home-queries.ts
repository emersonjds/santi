import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { type HomeView, api, dataOrThrow } from '@/shared/api/client'

export const myProjectsQuery = queryOptions({
  queryKey: ['home', 'projects'],
  queryFn: async () => dataOrThrow(await api.GET('/api/me/projects')),
})

const PAGE_SIZE = 50

export const myIssuesQuery = (view: HomeView) =>
  infiniteQueryOptions({
    queryKey: ['home', 'issues', view],
    queryFn: async ({ pageParam }) =>
      dataOrThrow(
        await api.GET('/api/me/issues', {
          params: {
            query: { view, limit: PAGE_SIZE, cursor: pageParam || undefined },
          },
        })
      ),
    // The cursor is an offset: 0 is the first page.
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

const FLYOUT_PAGE = 15

export const recentQuery = (q: string) =>
  infiniteQueryOptions({
    queryKey: ['home', 'recent', q],
    queryFn: async ({ pageParam }) =>
      dataOrThrow(
        await api.GET('/api/me/recent', {
          params: {
            query: { q, limit: FLYOUT_PAGE, cursor: pageParam || undefined },
          },
        })
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

export type StarredKind = 'project' | 'issue'

export const starredQuery = (kind: StarredKind | undefined, q: string) =>
  infiniteQueryOptions({
    queryKey: ['home', 'starred', kind, q],
    queryFn: async ({ pageParam }) =>
      dataOrThrow(
        await api.GET('/api/me/starred', {
          params: {
            query: {
              kind,
              q,
              limit: FLYOUT_PAGE,
              cursor: pageParam || undefined,
            },
          },
        })
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    // UI-60: an item unstarred in the flyout stays until it closes; reopening asks again.
    gcTime: 0,
  })
