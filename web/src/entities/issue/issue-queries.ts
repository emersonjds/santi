import { type QueryClient, queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { api, dataOrThrow, hasStatus } from '@/shared/api/client'

// ponytail: one page of 200 (the API maximum); add "Show older" paging when a thread or a parent outgrows it.
const PAGE = 200

export const issuesKey = (projectKey: string) =>
  ['projects', projectKey, 'issues'] as const

export const issueQuery = (projectKey: string, number: number) =>
  queryOptions({
    queryKey: [...issuesKey(projectKey), number],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/issues/{number}', {
          params: { path: { key: projectKey, number } },
        })
      ),
  })

export const commentsQuery = (projectKey: string, number: number) =>
  queryOptions({
    queryKey: [...issuesKey(projectKey), number, 'comments'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/issues/{number}/comments', {
          params: { path: { key: projectKey, number }, query: { limit: PAGE } },
        })
      ).items,
  })

export const subtasksQuery = (projectKey: string, parentKey: string) =>
  queryOptions({
    queryKey: [...issuesKey(projectKey), { parent: parentKey }],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/issues', {
          params: {
            path: { key: projectKey },
            query: { parent: [parentKey], limit: PAGE },
          },
        })
      ).items,
  })

/** The issue page's data; a malformed or unknown number gets the not-found page. */
export const loadIssue = async (
  queryClient: QueryClient,
  projectKey: string,
  number: string
) => {
  const parsed = Number(number)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw notFound()
  try {
    return await queryClient.ensureQueryData(issueQuery(projectKey, parsed))
  } catch (error) {
    if (hasStatus(error, 404)) throw notFound()
    throw error
  }
}
