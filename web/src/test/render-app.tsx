import { createMemoryHistory } from '@tanstack/react-router'
import { render } from 'vitest-browser-react'
import { App } from '@/app/app'
import { createApp } from '@/app/create-app'

/** Renders the whole SPA at `path` (without the `/app` base), as a browser would load it. */
export const renderApp = async (path: string) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const history = createMemoryHistory({ initialEntries: [base + path] })
  const { queryClient, router } = createApp(history)
  queryClient.setDefaultOptions({ queries: { retry: false } })
  const screen = await render(<App queryClient={queryClient} router={router} />)
  return { screen, router, queryClient }
}
