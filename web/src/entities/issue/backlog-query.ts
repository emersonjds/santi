import { queryOptions } from '@tanstack/react-query'
import { api, dataOrThrow } from '@/shared/api/client'
import type { BoardFilters } from './board-query'

/** Every backlog cache of a project, whatever its filters: what writes patch and refresh. */
export const backlogKey = (projectKey: string) =>
  ['projects', projectKey, 'backlog'] as const

/** BL-1: open sprints in order, then the no-sprint section; the board's quick filters apply (D18). */
export const backlogQuery = (projectKey: string, filters: BoardFilters) =>
  queryOptions({
    queryKey: [...backlogKey(projectKey), filters],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/backlog', {
          params: { path: { key: projectKey }, query: filters },
        })
      ),
  })
