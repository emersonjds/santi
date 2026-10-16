import { type QueryClient, queryOptions } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { api, dataOrThrow, hasStatus } from '@/shared/api/client'

export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: async () => dataOrThrow(await api.GET('/api/projects')),
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

/** Project and members for a project page; non-members get the not-found page (D28). */
export const loadProject = async (queryClient: QueryClient, key: string) => {
  try {
    const [project] = await Promise.all([
      queryClient.ensureQueryData(projectQuery(key)),
      queryClient.ensureQueryData(membersQuery(key)),
    ])
    return project
  } catch (error) {
    if (hasStatus(error, 404)) throw notFound()
    throw error
  }
}
