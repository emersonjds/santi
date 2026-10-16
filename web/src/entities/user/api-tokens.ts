import { queryOptions } from '@tanstack/react-query'
import { api, dataOrThrow } from '@/shared/api/client'

/** The signed-in user's API tokens for the CLI and MCP (D23): names and dates, never the secret. */
export const tokensQuery = queryOptions({
  queryKey: ['tokens'],
  queryFn: async () => dataOrThrow(await api.GET('/api/tokens')),
})
