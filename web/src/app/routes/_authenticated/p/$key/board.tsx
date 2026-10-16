import { createFileRoute } from '@tanstack/react-router'
import { BoardPage } from '@/pages/board/board-page'
import {
  boardFilters,
  boardQuery,
  boardSettingsQuery,
  parseBoardSearch,
} from '@/entities/issue/board-query'

export const Route = createFileRoute('/_authenticated/p/$key/board')({
  validateSearch: parseBoardSearch,
  loaderDeps: ({ search }) => boardFilters(search),
  // Not awaited: the page draws its skeleton, and a filter toggle keeps the old cards until the new ones land.
  loader: ({ context: { queryClient }, params, deps }) => {
    void queryClient.prefetchQuery(boardQuery(params.key, deps))
    void queryClient.prefetchQuery(boardSettingsQuery(params.key))
  },
  component: BoardPage,
})
