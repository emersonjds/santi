import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import type { createAppRouter } from './router'

type AppProps = {
  queryClient: QueryClient
  router: ReturnType<typeof createAppRouter>
}

export const App = ({ queryClient, router }: AppProps) => (
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
)
