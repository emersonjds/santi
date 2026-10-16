import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/pages/home/home-page'
import { myIssuesQuery, myProjectsQuery } from '@/entities/home/home-queries'
import { parseHomeSearch } from '@/entities/home/views'

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: parseHomeSearch,
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'recommended' }),
  // Not awaited: the page draws its skeletons; hovering a tab prefetches its list.
  loader: ({ context: { queryClient }, deps }) => {
    void queryClient.prefetchQuery(myProjectsQuery)
    void queryClient.prefetchInfiniteQuery(myIssuesQuery(deps.tab))
  },
  component: HomePage,
})
