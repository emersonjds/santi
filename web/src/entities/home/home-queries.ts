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
