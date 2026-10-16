import { beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { WEB_BOARD, inProjects, routeOf } from '@/test/stub-api'

const boardQueries = (requests: Request[]) =>
  requests
    .filter((request) => routeOf(request) === 'GET /api/projects/WEB/board')
    .map((request) => new URL(request.url).search)

describe('board filter bar', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('keeps an assignee filter in the URL', async () => {
    const requests = inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    const bob = screen.getByRole('button', { name: 'Issues of Bob Stone' })
    await bob.click()

    await expect.element(bob).toHaveAttribute('aria-pressed', 'true')
    expect(router.state.location.search).toEqual({ assignee: [2] })
    await expect.poll(() => boardQueries(requests)).toContain('?assignee=2')

    expect(router.state.location.href).toMatch(/\?assignee=%5B2%5D$/)
  })

  it('reads the filters back from a shared link', async () => {
    const requests = inProjects()
    const { screen } = await renderApp('/p/WEB/board?assignee=%5B2%5D')

    await expect
      .element(screen.getByRole('button', { name: 'Issues of Bob Stone' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(boardQueries(requests)).toEqual(['?assignee=2'])
  })

  it('toggles my issues and recent ones, then clears every filter', async () => {
    const requests = inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    await screen.getByRole('button', { name: 'Only my issues' }).click()
    await screen.getByRole('button', { name: 'Recently updated' }).click()

    await expect
      .element(screen.getByRole('button', { name: 'Only my issues' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(router.state.location.search).toEqual({
      assignee: [1],
      recently_updated: true,
    })
    await expect
      .poll(() => boardQueries(requests))
      .toContain('?assignee=1&recently_updated=true')

    await screen.getByRole('link', { name: 'Clear filters' }).click()

    await expect.poll(() => router.state.location.search).toEqual({})
    await expect
      .element(screen.getByRole('button', { name: 'Recently updated' }))
      .toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('link', { name: 'Clear filters' }).elements()
    ).toHaveLength(0)
  })

  it('says so when the filters hide every card', async () => {
    inProjects({
      'GET /api/projects/WEB/board': {
        status: 200,
        body: {
          ...WEB_BOARD,
          columns: WEB_BOARD.columns.map((column) => ({
            ...column,
            cards: [],
          })),
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/board?recently_updated=true')

    await expect
      .element(screen.getByText('No issues match these filters.'))
      .toBeVisible()
  })
})
