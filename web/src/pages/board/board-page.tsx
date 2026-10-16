import { useParams, useSearch } from '@tanstack/react-router'
import { Board } from '@/widgets/board/board'
import { IssueOverlay } from '@/widgets/issue-detail/issue-overlay'

const ROUTE = '/_authenticated/p/$key/board'

export const BoardPage = () => {
  const { key } = useParams({ from: ROUTE })
  // Without the open issue, so opening one leaves the board's render alone (INP, D39).
  const search = useSearch({
    from: ROUTE,
    select: ({ issue: _, ...board }) => board,
    structuralSharing: true,
  })
  const issue = useSearch({ from: ROUTE, select: (each) => each.issue })
  return (
    <>
      <Board projectKey={key} search={search} />
      <IssueOverlay projectKey={key} issue={issue} />
    </>
  )
}
