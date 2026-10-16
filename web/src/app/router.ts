import type { QueryClient } from '@tanstack/react-query'
import { type RouterHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const createAppRouter = (
  queryClient: QueryClient,
  history?: RouterHistory
) =>
  createRouter({
    routeTree,
    context: { queryClient },
    history,
    basepath: import.meta.env.BASE_URL,
    defaultPreload: 'intent',
  })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
