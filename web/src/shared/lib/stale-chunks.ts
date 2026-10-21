const RELOADED = 'santi.chunk-reload'

// Chromium, Firefox and Safari word a failed `import()` differently.
const CHUNK_ERROR =
  /dynamically imported module|module script failed|Unable to preload/i

/** `location.reload` can't be stubbed (unforgeable); tests replace this one. */
export const browser = {
  reload: () => location.reload(),
  /** The entry script's hashed URL changes with every deploy. */
  build: () =>
    document.querySelector<HTMLScriptElement>('script[type="module"][src]')
      ?.src ?? '',
}

export const isChunkError = (error: unknown) =>
  error instanceof Error && CHUNK_ERROR.test(error.message)

/** Reloads once per build: a newer deploy gets its own reload, a chunk missing from this build does not loop. */
export const reloadOnce = () => {
  try {
    const build = browser.build()
    if (sessionStorage.getItem(RELOADED) === build) return false
    sessionStorage.setItem(RELOADED, build)
  } catch {
    return false
  }
  browser.reload()
  return true
}

/** Vite's event for a chunk or stylesheet a lazy import could not preload. */
export const listenForStaleChunks = () => {
  const onError = (event: Event) => {
    if (reloadOnce()) event.preventDefault()
  }
  window.addEventListener('vite:preloadError', onError)
  return () => window.removeEventListener('vite:preloadError', onError)
}
