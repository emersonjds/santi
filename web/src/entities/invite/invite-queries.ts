import { queryOptions } from '@tanstack/react-query'
import { api, dataOrThrow } from '@/shared/api/client'

/** SAN-177: the project's live invite links, for admins. */
export const invitesQuery = (key: string) =>
  queryOptions({
    queryKey: ['projects', key, 'invites'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/invites', {
          params: { path: { key } },
        })
      ),
  })
