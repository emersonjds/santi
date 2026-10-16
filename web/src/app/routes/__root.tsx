import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext } from '@tanstack/react-router'
import { ErrorPage } from '@/pages/error/error-page'
import { NotFoundPage } from '@/pages/not-found/not-found-page'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
})
