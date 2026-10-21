import { queryOptions } from '@tanstack/react-query'
import { api, dataOrThrow } from '@/shared/api/client'

/** The signed-in user's browser and CLI sign-ins (D60), most recent activity first. */
export const sessionsQuery = queryOptions({
  queryKey: ['sessions'],
  queryFn: async () => dataOrThrow(await api.GET('/api/me/sessions')),
})
