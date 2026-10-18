import { type ReactNode, use } from 'react'
import { preloadMarkdownView } from './load-markdown-view'
import type { MarkdownViewProps } from './markdown-view'

/** Suspends until the renderer chunk is in, so everything it wraps paints once. */
export const MarkdownReady = ({ children }: { children: ReactNode }) => {
  use(preloadMarkdownView())
  return children
}

export const MarkdownView = (props: MarkdownViewProps) => {
  const { MarkdownView: View } = use(preloadMarkdownView())
  return <View {...props} />
}
