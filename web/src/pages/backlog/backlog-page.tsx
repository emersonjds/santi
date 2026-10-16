import { useParams, useSearch } from '@tanstack/react-router'
import { Backlog } from '@/widgets/backlog/backlog'
import { IssueOverlay } from '@/widgets/issue-detail/issue-overlay'

const ROUTE = '/_authenticated/p/$key/backlog'

export const BacklogPage = () => {
  const { key } = useParams({ from: ROUTE })
  // Without the open issue, so opening one leaves the backlog's render alone (INP, D39).
  const search = useSearch({
    from: ROUTE,
    select: ({ issue: _, ...backlog }) => backlog,
    structuralSharing: true,
  })
  const issue = useSearch({ from: ROUTE, select: (each) => each.issue })
  return (
    <>
      <Backlog projectKey={key} search={search} />
      <IssueOverlay projectKey={key} issue={issue} />
    </>
  )
}
