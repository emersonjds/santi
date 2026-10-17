import { type QueryClient, queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { api, dataOrThrow, hasStatus } from '@/shared/api/client'
import { rememberProject } from './last-project'

export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: async () => dataOrThrow(await api.GET('/api/projects')),
})

/** SAN-70: only the projects the caller administers. */
export const projectsInStateQuery = (state: 'archived' | 'trashed') =>
  queryOptions({
    queryKey: ['projects', { state }],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects', { params: { query: { state } } })
      ),
  })

export const projectQuery = (key: string) =>
  queryOptions({
    queryKey: ['projects', key],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}', { params: { path: { key } } })
      ),
  })

export const membersQuery = (key: string) =>
  queryOptions({
    queryKey: ['projects', key, 'members'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/members', {
          params: { path: { key } },
        })
      ),
  })

export const sprintsQuery = (key: string) =>
  queryOptions({
    queryKey: ['projects', key, 'sprints'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/sprints', {
          params: { path: { key } },
        })
      ),
  })

export const invitePreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ['invites', token],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/invites/{token}', { params: { path: { token } } })
      ),
  })

/** Project and members for a project page; non-members get the not-found page (D28). */
export const loadProject = async (queryClient: QueryClient, key: string) => {
  try {
    const [project] = await Promise.all([
      queryClient.ensureQueryData(projectQuery(key)),
      queryClient.ensureQueryData(membersQuery(key)),
    ])
    rememberProject(key)
    return project
  } catch (error) {
    if (hasStatus(error, 404)) throw notFound()
    throw error
  }
}
