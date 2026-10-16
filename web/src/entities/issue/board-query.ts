import { queryOptions } from '@tanstack/react-query'
import { type IssueType, api, dataOrThrow } from '@/shared/api/client'
import { isIssueType } from './labels'

/** The board URL (D18): quick filters, the column shown at 375px, and the issue open over it (IA §6). */
export type BoardSearch = {
  assignee?: number[]
  type?: IssueType[]
  label?: string[]
  /** An epic's key, or `none` for issues without one. */
  epic?: string
  q?: string
  recently_updated?: boolean
  column?: number
  issue?: number
  /** The backlog's side panel (D10). */
  panel?: 'epics'
}

/** The quick filters as the board, backlog and search endpoints take them (D3). */
export type BoardFilters = {
  assignee?: number[]
  type?: IssueType[]
  label?: string[]
  parent?: string[]
  q?: string
  recently_updated?: boolean
}

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

// `none`, or a project key (2 to 10 letters or digits) and an issue number.
const EPIC = /^(?:none|[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*)$/

/** One value or a list of them (`?type=bug` or `?type=["bug"]`), keeping the well-formed ones. */
const listOf = <Value>(
  value: unknown,
  keep: (each: unknown) => each is Value
) => {
  const kept = (Array.isArray(value) ? value : [value]).filter(keep)
  return kept.length > 0 ? kept : undefined
}

/** Keeps only well-formed params, so a hand-edited link never breaks the board. */
export const parseBoardSearch = (
  search: Record<string, unknown>
): BoardSearch => ({
  assignee: listOf(search.assignee, isId),
  type: listOf(
    search.type,
    (each): each is IssueType => typeof each === 'string' && isIssueType(each)
  ),
  label: listOf(search.label, isText),
  epic:
    typeof search.epic === 'string' && EPIC.test(search.epic)
      ? search.epic
      : undefined,
  // A number-like `?q=42` arrives parsed as a number; Postgres refuses NUL in text.
  q:
    search.q === undefined
      ? undefined
      : String(search.q).replaceAll('\0', '').trim() || undefined,
  recently_updated: search.recently_updated === true || undefined,
  column: isId(search.column) ? search.column : undefined,
  issue: isId(search.issue) ? search.issue : undefined,
  panel: search.panel === 'epics' ? 'epics' : undefined,
})

export const boardFilters = ({
  assignee,
  type,
  label,
  epic,
  q,
  recently_updated,
}: BoardSearch): BoardFilters => ({
  assignee,
  type,
  label,
  parent: epic === undefined ? undefined : [epic],
  q,
  recently_updated,
})

/** How many kinds of filter are on: the badge on "Filters" and "Clear filters". */
export const countFilters = (search: BoardSearch) =>
  [
    search.assignee,
    search.type,
    search.label,
    search.epic,
    search.q,
    search.recently_updated,
  ].filter((each) => each !== undefined).length

/** Every label in use in the project, for the Label filter. */
export const labelsQuery = (projectKey: string) =>
  queryOptions({
    queryKey: ['projects', projectKey, 'labels'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/labels', {
          params: { path: { key: projectKey } },
        })
      ),
  })

/** The project's epics, for the Epic filter. */
export const epicsQuery = (projectKey: string) =>
  queryOptions({
    queryKey: ['projects', projectKey, 'epics'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/issues', {
          // ponytail: the first 100 epics; page through them if a project outgrows that.
          params: {
            path: { key: projectKey },
            query: { type: ['epic'], limit: 100 },
          },
        })
      ).items,
  })

/** Open stories, tasks and bugs: what a new subtask can hang under. */
export const parentsQuery = (projectKey: string) =>
  queryOptions({
    queryKey: ['projects', projectKey, 'parents'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/issues', {
          // ponytail: the first 200 open ones; a search box when a project outgrows that.
          params: {
            path: { key: projectKey },
            query: {
              type: ['story', 'task', 'bug'],
              status: ['todo', 'in_progress'],
              limit: 200,
            },
          },
        })
      ).items,
  })

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
