import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { render } from 'vitest-browser-react'
import { App } from '@/app/app'
import { createAppRouter } from '@/app/router'

/** Renders the whole SPA at `path` (without the `/app` base), as a browser would load it. */
export const renderApp = async (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const history = createMemoryHistory({ initialEntries: [base + path] })
  const router = createAppRouter(queryClient, history)
  const screen = await render(<App queryClient={queryClient} router={router} />)
  return { screen, router, queryClient }
}
