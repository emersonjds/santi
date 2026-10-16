import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { sessionQuery } from './session-query'

export const requireSession = async (
  queryClient: QueryClient,
  returnTo: string
) => {
  const user = await queryClient.ensureQueryData(sessionQuery)
  if (!user) throw redirect({ to: '/login', search: { redirect: returnTo } })
  return user
}
