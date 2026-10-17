import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { parseBoardSearch } from '@/entities/issue/board-query'
import { api, dataOrThrow } from '@/shared/api/client'

const PAGE_SIZE = 50

/** Started sprints with their totals: the active one first, then closed ones, newest close first (D46). */
export const sprintHistoryQuery = (projectKey: string) =>
  infiniteQueryOptions({
    queryKey: ['projects', projectKey, 'reports', 'sprints'],
    queryFn: async ({ pageParam }) =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/reports/sprints', {
          params: {
            path: { key: projectKey },
            query: { limit: PAGE_SIZE, cursor: pageParam || undefined },
          },
        })
      ),
    // Ids start at 1: cursor 0 is the first page.
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

export const velocityQuery = (projectKey: string) =>
  queryOptions({
    queryKey: ['projects', projectKey, 'reports', 'velocity'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/reports/velocity', {
          params: { path: { key: projectKey } },
        })
      ),
  })

export const sprintReportQuery = (projectKey: string, sprintId: number) =>
  queryOptions({
    queryKey: ['projects', projectKey, 'reports', 'sprints', sprintId],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/sprints/{id}/report', {
          params: { path: { key: projectKey, id: sprintId } },
        })
      ),
  })

/** RP-26: a total with nothing estimated is absent, never 0. */
export const formatPoints = (points: number | null | undefined) =>
  points == null ? '—' : String(points)

export const parseReportSearch = (
  search: Record<string, unknown>
): { issue?: number } => {
  const { issue } = parseBoardSearch(search)
  return issue === undefined ? {} : { issue }
}
