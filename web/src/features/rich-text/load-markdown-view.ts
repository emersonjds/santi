let chunk: Promise<typeof import('./markdown-view')> | undefined

/** D50: the renderer is its own chunk; callers start it beside the issue fetch. */
export const preloadMarkdownView = () => (chunk ??= import('./markdown-view'))
