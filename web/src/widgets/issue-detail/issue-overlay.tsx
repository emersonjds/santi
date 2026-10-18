import { Suspense, lazy } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { preloadMarkdownView } from '@/features/rich-text/load-markdown-view'

// Lazy: the board and backlog first visits have no initial JS to spare (D39).
const IssueDialog = lazy(() => {
  void preloadMarkdownView()
  return import('./issue-dialog').then((module) => ({
    default: module.IssueDialog,
  }))
})

type IssueOverlayProps = { projectKey: string; issue?: number }

/** The issue opened from a card or row (IA §6); closing goes back to the page URL with its filters. */
export const IssueOverlay = ({ projectKey, issue }: IssueOverlayProps) => {
  const router = useRouter()
  const navigate = useNavigate()
  if (!issue) return null

  const close = () => {
    if (router.history.canGoBack()) return router.history.back()
    void navigate({
      to: '.',
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
