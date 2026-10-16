import { createFileRoute } from '@tanstack/react-router'
import { ComingNextPage } from '@/pages/coming-next/coming-next-page'

export const Route = createFileRoute('/_authenticated/p/$key/search')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: search.q === undefined ? undefined : String(search.q),
  }),
  component: () => <ComingNextPage title='Search' />,
})
