import { createFileRoute, redirect } from '@tanstack/react-router'
import { BacklogPage } from '@/pages/backlog/backlog-page'
import { backlogQuery } from '@/entities/issue/backlog-query'
import {
  boardFilters,
  boardSettingsQuery,
  parseBoardSearch,
} from '@/entities/issue/board-query'
import { loadProject } from '@/entities/project/project-queries'

export const Route = createFileRoute('/_authenticated/p/$key/backlog')({
  validateSearch: parseBoardSearch,
  loaderDeps: ({ search }) => boardFilters(search),
  // The project (cached by the parent route) decides the kanban redirect; the backlog is not awaited, so the page draws its skeleton.
  loader: async ({ context: { queryClient }, params, deps }) => {
    const project = await loadProject(queryClient, params.key)
    if (project.board_type === 'kanban')
      throw redirect({ to: '/p/$key/board', params, replace: true })
    void queryClient.prefetchQuery(backlogQuery(params.key, deps))
    void queryClient.prefetchQuery(boardSettingsQuery(params.key))
  },
  component: BacklogPage,
})
