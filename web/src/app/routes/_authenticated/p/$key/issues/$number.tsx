import { createFileRoute } from '@tanstack/react-router'
import { IssuePage } from '@/pages/issue/issue-page'
import { preloadIssueSections } from '@/widgets/issue-detail/load-issue-sections'
import { preloadMarkdownView } from '@/features/rich-text/load-markdown-view'
import { loadIssue } from '@/entities/issue/issue-queries'

export const Route = createFileRoute('/_authenticated/p/$key/issues/$number')({
  loader: ({ context, params }) => {
    void preloadMarkdownView()
    void preloadIssueSections()
    return loadIssue(context.queryClient, params.key, params.number)
  },
  component: IssuePage,
})
