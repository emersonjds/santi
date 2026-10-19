import { type QueryClient, queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { type Comment, api, dataOrThrow, hasStatus } from '@/shared/api/client'

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
    // SAN-136 Q8: every page, oldest first, until SAN-94 pages the Activity feed.
    queryFn: async () => {
      const comments: Comment[] = []
      let cursor: number | undefined
      for (;;) {
        const page = dataOrThrow(
          await api.GET('/api/projects/{key}/issues/{number}/comments', {
            params: {
              path: { key: projectKey, number },
              query: { limit: PAGE, cursor },
            },
          })
        )
        comments.push(...page.items)
        if (page.next_cursor == null || page.next_cursor === cursor)
          return comments
        cursor = page.next_cursor
      }
    },
  })

// ponytail: one page of 200 (the API maximum); add paging when a parent outgrows it.
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
