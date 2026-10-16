import { queryOptions } from '@tanstack/react-query'
import { api, dataOrThrow } from '@/shared/api/client'

/** The board URL (D18): quick filters plus the column shown at 375px. */
export type BoardSearch = {
  assignee?: number[]
  recently_updated?: boolean
  column?: number
}

export type BoardFilters = Pick<BoardSearch, 'assignee' | 'recently_updated'>

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/** Keeps only well-formed params, so a hand-edited link never breaks the board. */
export const parseBoardSearch = (
  search: Record<string, unknown>
): BoardSearch => {
  const assignee = Array.isArray(search.assignee)
    ? search.assignee.filter(isId)
    : []
  return {
    assignee: assignee.length > 0 ? assignee : undefined,
    recently_updated: search.recently_updated === true || undefined,
    column: isId(search.column) ? search.column : undefined,
  }
}

export const boardFilters = ({
  assignee,
  recently_updated,
}: BoardSearch): BoardFilters => ({ assignee, recently_updated })

/** Every board cache of a project, whatever its filters: what writes patch and refresh. */
export const boardsKey = (projectKey: string) =>
  ['projects', projectKey, 'board'] as const

export const boardQuery = (projectKey: string, filters: BoardFilters) =>
  queryOptions({
    queryKey: [...boardsKey(projectKey), filters],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/board', {
          params: { path: { key: projectKey }, query: filters },
        })
      ),
  })

export const boardSettingsQuery = (projectKey: string) =>
  queryOptions({
    queryKey: ['projects', projectKey, 'board-settings'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/board/settings', {
          params: { path: { key: projectKey } },
        })
      ),
  })

/** `WEB-12` → 12. */
export const issueNumber = (issueKey: string) =>
  Number(issueKey.slice(issueKey.lastIndexOf('-') + 1))
