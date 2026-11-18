/** Starts a lazy chunk once and shares it; a failed load is dropped so the next call tries again. */
export const preloadOnce = <Module>(load: () => Promise<Module>) => {
  let chunk: Promise<Module> | undefined
  return () =>
    (chunk ??= load().catch((error: unknown) => {
      chunk = undefined
      throw error
    }))
}
