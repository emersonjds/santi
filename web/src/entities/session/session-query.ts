import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'

/** The signed-in user, or `null` for an anonymous visitor. */
export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    const { data, response } = await api.GET('/api/me')
    if (response.status === 401) return null
    if (!data) throw new Error(`GET /api/me answered ${response.status}`)
    return data
  },
  staleTime: Infinity,
})
