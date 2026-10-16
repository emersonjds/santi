import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import type { RouterHistory } from '@tanstack/react-router'
import { forgetSession } from '@/entities/session/require-session'
import { ApiError, hasStatus } from '@/shared/api/client'
import { createAppRouter } from './router'

const MAX_RETRIES = 2

/** Wires the query cache to the router: a 401 anywhere ends the session and asks to sign in again. */
export const createApp = (history?: RouterHistory) => {
  const onError = (error: Error) => {
    if (!hasStatus(error, 401)) return
    forgetSession(queryClient)
    void router.navigate({
      to: '/login',
      search: { redirect: router.state.location.href },
    })
  }
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status < 500) &&
          failures < MAX_RETRIES,
      },
    },
  })
  const router = createAppRouter(queryClient, history)
  return { queryClient, router }
}
