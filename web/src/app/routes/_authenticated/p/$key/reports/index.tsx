import { createFileRoute, redirect } from '@tanstack/react-router'
import { ReportsPage } from '@/pages/reports/reports-page'
import { loadProject } from '@/entities/project/project-queries'
import {
  parseReportSearch,
  sprintHistoryQuery,
  velocityQuery,
} from '@/entities/report/report-queries'

export const Route = createFileRoute('/_authenticated/p/$key/reports/')({
  validateSearch: parseReportSearch,
  // The project (cached by the parent route) decides the kanban redirect; the reports are not awaited, so the page draws its skeletons.
  loader: async ({ context: { queryClient }, params }) => {
    const project = await loadProject(queryClient, params.key)
    if (project.board_type === 'kanban')
      throw redirect({ to: '/p/$key/board', params, replace: true })
    void queryClient.prefetchInfiniteQuery(sprintHistoryQuery(params.key))
    void queryClient.prefetchQuery(velocityQuery(params.key))
  },
  component: ReportsPage,
})
