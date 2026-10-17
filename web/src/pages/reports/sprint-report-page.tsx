import { useParams, useSearch } from '@tanstack/react-router'
import { IssueOverlay } from '@/widgets/issue-detail/issue-overlay'
import { SprintReportView } from '@/widgets/reports/sprint-report'

const ROUTE = '/_authenticated/p/$key/reports/$id'

export const SprintReportPage = () => {
  const { key, id } = useParams({ from: ROUTE })
  const issue = useSearch({ from: ROUTE, select: (each) => each.issue })
  return (
    <div className='mx-auto flex w-full max-w-[68.75rem] flex-col gap-6 px-4 py-4 sm:px-6'>
      <SprintReportView projectKey={key} sprintId={Number(id)} />
      <IssueOverlay projectKey={key} issue={issue} />
    </div>
  )
}
