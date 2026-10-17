import { createFileRoute, redirect } from '@tanstack/react-router'
import { SprintReportPage } from '@/pages/reports/sprint-report-page'
import { loadProject } from '@/entities/project/project-queries'
import {
  parseReportSearch,
  sprintHistoryQuery,
  sprintReportQuery,
} from '@/entities/report/report-queries'

export const Route = createFileRoute('/_authenticated/p/$key/reports/$id')({
  validateSearch: parseReportSearch,
  // The project (cached by the parent route) decides the kanban redirect; the report is not awaited, so the page draws its skeletons.
  loader: async ({ context: { queryClient }, params }) => {
    const project = await loadProject(queryClient, params.key)
    if (project.board_type === 'kanban')
      throw redirect({
        to: '/p/$key/board',
        params: { key: params.key },
        replace: true,
      })
    void queryClient.prefetchQuery(
      sprintReportQuery(params.key, Number(params.id))
    )
    void queryClient.prefetchInfiniteQuery(sprintHistoryQuery(params.key))
  },
  component: SprintReportPage,
})
