import { createMemoryHistory } from '@tanstack/react-router'
import { render } from 'vitest-browser-react'
import { App } from '@/app/app'
import { createApp } from '@/app/create-app'

/** Renders the whole SPA at `path`, as a browser would load it. */
export const renderApp = async (path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] })
  const { queryClient, router } = createApp(history)
  queryClient.setDefaultOptions({ queries: { retry: false } })
  const screen = await render(<App queryClient={queryClient} router={router} />)
  return { screen, router, queryClient }
}
