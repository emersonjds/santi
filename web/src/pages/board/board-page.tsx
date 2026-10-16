import { Suspense, lazy } from 'react'
import {
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/react-router'
import { Board } from '@/widgets/board/board'

const ROUTE = '/_authenticated/p/$key/board'

// Lazy: the board's first visit has no initial JS to spare (D39).
const IssueDialog = lazy(() =>
  import('@/widgets/issue-detail/issue-dialog').then((module) => ({
    default: module.IssueDialog,
  }))
)

/** The issue opened from a card (IA §6); closing goes back to the board URL with its filters. */
const IssueOverlay = ({ projectKey }: { projectKey: string }) => {
  const issue = useSearch({ from: ROUTE, select: (search) => search.issue })
  const router = useRouter()
  const navigate = useNavigate({ from: '/p/$key/board' })
  if (!issue) return null

  const close = () => {
    if (router.history.canGoBack()) return router.history.back()
    void navigate({
      search: (prev) => ({ ...prev, issue: undefined }),
      replace: true,
    })
  }

  return (
    <Suspense fallback={null}>
      <IssueDialog projectKey={projectKey} number={issue} onClose={close} />
    </Suspense>
  )
}

export const BoardPage = () => {
  const { key } = useParams({ from: ROUTE })
  // Without the open issue, so opening one leaves the board's render alone (INP, D39).
  const search = useSearch({
    from: ROUTE,
    select: ({ issue: _, ...board }) => board,
    structuralSharing: true,
  })
  return (
    <>
      <Board projectKey={key} search={search} />
      <IssueOverlay projectKey={key} />
    </>
  )
}
