import { createFileRoute } from '@tanstack/react-router'
import { BoardSettingsPage } from '@/pages/board-settings/board-settings-page'
import { boardSettingsQuery } from '@/entities/issue/board-query'

export const Route = createFileRoute('/_authenticated/p/$key/settings/')({
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(boardSettingsQuery(params.key))
  },
  component: BoardSettingsPage,
})
