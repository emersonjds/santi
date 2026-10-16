import { createFileRoute, redirect } from '@tanstack/react-router'
import { ComingNextPage } from '@/pages/coming-next/coming-next-page'
import { loadProject } from '@/entities/project/project-queries'

export const Route = createFileRoute('/_authenticated/p/$key/backlog')({
  loader: async ({ context, params }) => {
    const project = await loadProject(context.queryClient, params.key)
    if (project.board_type === 'kanban')
      throw redirect({ to: '/p/$key/board', params, replace: true })
  },
  component: () => <ComingNextPage title='Backlog' />,
})
