const RELOADED = 'santi.chunk-reload'

// Chromium, Firefox and Safari word a failed `import()` differently.
const CHUNK_ERROR =
  /dynamically imported module|module script failed|Unable to preload/i

/** `location.reload` can't be stubbed (unforgeable); tests replace this one. */
export const browser = { reload: () => location.reload() }

export const isChunkError = (error: unknown) =>
  error instanceof Error && CHUNK_ERROR.test(error.message)

/**
 * After a deploy, an open tab asks for chunks the server no longer has: reload once onto the new
 * build. Without session storage there is no loop guard, so no reload.
 */
// ponytail: once per tab session; a second deploy in the same session shows the error page until a manual reload.
export const reloadOnce = () => {
  try {
    if (sessionStorage.getItem(RELOADED)) return false
    sessionStorage.setItem(RELOADED, '1')
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
