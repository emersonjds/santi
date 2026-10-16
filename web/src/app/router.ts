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
    // TanStack Query decides freshness; the router only triggers the loaders (D39 prefetch).
    defaultPreloadStaleTime: 0,
    // A masked issue dialog (IA §6) reloads as the full issue page.
    unmaskOnReload: true,
  })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
