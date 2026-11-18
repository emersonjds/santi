let chunk: Promise<typeof import('./issue-sections')> | undefined

/** D39: the sections below the description are their own chunk; callers start it beside the issue fetch. */
export const preloadIssueSections = () => (chunk ??= import('./issue-sections'))
