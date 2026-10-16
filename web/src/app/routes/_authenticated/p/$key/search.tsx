import { createFileRoute } from '@tanstack/react-router'
import { SearchPage } from '@/pages/search/search-page'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import {
  parseIssueSearch,
  searchFilters,
  searchQuery,
} from '@/entities/issue/search-query'

export const Route = createFileRoute('/_authenticated/p/$key/search')({
  validateSearch: parseIssueSearch,
  loaderDeps: ({ search }) => searchFilters(search),
  // Not awaited: the page draws its skeleton, and a filter change keeps the old rows until the new ones land.
  loader: ({ context: { queryClient }, params, deps }) => {
    void queryClient.prefetchInfiniteQuery(searchQuery(params.key, deps))
    void queryClient.prefetchQuery(boardSettingsQuery(params.key))
  },
  component: SearchPage,
})
