import { useEffect } from 'react'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import type { createAppRouter } from './router'

type AppProps = {
  queryClient: QueryClient
  router: ReturnType<typeof createAppRouter>
}

/** A file dropped where no drop zone took it: the browser would leave santi to open it. */
const refuseStrayFiles = (event: DragEvent) => {
  if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files'))
    return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'none'
}

export const App = ({ queryClient, router }: AppProps) => {
  useEffect(() => {
    window.addEventListener('dragover', refuseStrayFiles)
    window.addEventListener('drop', refuseStrayFiles)
    return () => {
      window.removeEventListener('dragover', refuseStrayFiles)
      window.removeEventListener('drop', refuseStrayFiles)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
