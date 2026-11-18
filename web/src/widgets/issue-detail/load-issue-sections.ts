import { preloadOnce } from '@/shared/lib/preload-chunk'

/** D39: the sections below the description are their own chunk; callers start it beside the issue fetch. */
export const preloadIssueSections = preloadOnce(
  () => import('./issue-sections')
)
