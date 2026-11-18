import { preloadOnce } from '@/shared/lib/preload-chunk'

/** D50: the renderer is its own chunk; callers start it beside the issue fetch. */
export const preloadMarkdownView = preloadOnce(() => import('./markdown-view'))
