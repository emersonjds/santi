import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { inProjects, routeOf } from '@/test/stub-api'
import { browser, listenForStaleChunks, reloadOnce } from './stale-chunks'

const preloadError = () => {
  const event = new Event('vite:preloadError', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('stale chunks after a deploy', () => {
  let reload = vi.fn()
  beforeEach(() => {
    reload = vi.fn()
    vi.spyOn(browser, 'reload').mockImplementation(reload)
  })
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('reloads once for a failed preload, then lets the next one throw', () => {
    const stop = listenForStaleChunks()

    expect(preloadError().defaultPrevented).toBe(true)
    expect(preloadError().defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    stop()
  })

  it('reloads once more after each new deploy in the same session', () => {
    const build = vi
      .spyOn(browser, 'build')
      .mockReturnValue('/assets/index-a.js')
    const stop = listenForStaleChunks()

    expect(preloadError().defaultPrevented).toBe(true)
    build.mockReturnValue('/assets/index-b.js')
    expect(preloadError().defaultPrevented).toBe(true)
    expect(preloadError().defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledTimes(2)
    stop()
  })

  it('reloads the page when Try again follows a chunk error', async () => {
    inProjects()
    const stub = globalThis.fetch
    vi.stubGlobal('fetch', (request: Request) =>
      routeOf(request) === 'GET /api/projects/WEB'
        ? Promise.reject(
            new TypeError(
              'Failed to fetch dynamically imported module: /assets/board-1.js'
            )
          )
        : stub(request)
    )
    const { screen } = await renderApp('/p/WEB/board')
    await expect
      .element(screen.getByRole('heading', { name: 'Something went wrong' }))
      .toBeVisible()

    await screen.getByRole('button', { name: 'Try again' }).click()

    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('never reloads when session storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(reloadOnce()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once when a lazy chunk fails to load', async () => {
    inProjects()
    const stub = globalThis.fetch
    vi.stubGlobal('fetch', (request: Request) =>
      routeOf(request) === 'GET /api/projects/WEB'
        ? Promise.reject(
            new TypeError(
              'Failed to fetch dynamically imported module: /assets/board-1.js'
            )
          )
        : stub(request)
    )
    const { screen } = await renderApp('/p/WEB/board')

    await expect
      .element(screen.getByRole('heading', { name: 'Something went wrong' }))
      .toBeVisible()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadOnce()).toBe(false)
  })

  it('leaves any other error on the error page', async () => {
    inProjects()
    const stub = globalThis.fetch
    vi.stubGlobal('fetch', (request: Request) =>
      routeOf(request) === 'GET /api/projects/WEB'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : stub(request)
    )
    const { screen } = await renderApp('/p/WEB/board')

    await expect
      .element(screen.getByRole('heading', { name: 'Something went wrong' }))
      .toBeVisible()
    expect(reload).not.toHaveBeenCalled()
  })
})
