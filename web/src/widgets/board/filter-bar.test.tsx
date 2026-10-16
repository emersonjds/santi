import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { WEB_BOARD, inProjects, issue, routeOf } from '@/test/stub-api'

const boardQueries = (requests: Request[]) =>
  requests
    .filter((request) => routeOf(request) === 'GET /api/projects/WEB/board')
    .map((request) => new URL(request.url).search)

const EPICS = {
  'GET /api/projects/WEB/issues': {
    status: 200,
    body: {
      items: [
        issue({ key: 'WEB-9', summary: 'Checkout revamp', issue_type: 'epic' }),
      ],
      next_cursor: null,
    },
  },
}

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

  it('filters by type, label and epic, all kept in the URL', async () => {
    const requests = inProjects(EPICS)
    const { screen, router } = await renderApp('/p/WEB/board')

    await screen.getByRole('button', { name: 'Type' }).click()
    await screen.getByRole('menuitemcheckbox', { name: 'Bug' }).click()
    await screen
      .getByRole('menuitemcheckbox', { name: 'Task', exact: true })
      .click()
    await userEvent.keyboard('{Escape}')
    await screen.getByRole('button', { name: 'Label' }).click()
    await screen.getByRole('menuitemcheckbox', { name: 'ui' }).click()
    await userEvent.keyboard('{Escape}')
    await screen.getByLabelText('Epic').selectOptions('WEB-9 Checkout revamp')

    await expect
      .poll(() => router.state.location.search)
      .toEqual({
        type: ['bug', 'task'],
        label: ['ui'],
        epic: 'WEB-9',
      })
    await expect
      .poll(() => boardQueries(requests))
      .toContain('?type=bug&type=task&label=ui&parent=WEB-9')
    await expect
      .element(screen.getByRole('button', { name: 'Type' }))
      .toHaveTextContent('Type2')

    await screen.getByLabelText('Epic').selectOptions('No epic')

    await expect
      .poll(() => boardQueries(requests))
      .toContain('?type=bug&type=task&label=ui&parent=none')
  })

  it('sends the text box to the board once typing pauses', async () => {
    const requests = inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    await screen.getByRole('searchbox', { name: 'Filter issues' }).fill('login')

    await expect
      .poll(() => router.state.location.search)
      .toEqual({ q: 'login' })
    await expect.poll(() => boardQueries(requests)).toContain('?q=login')
    expect(boardQueries(requests)).not.toContain('?q=l')
  })

  it('reads every filter back from a shared link and clears them with their count', async () => {
    const requests = inProjects(EPICS)
    const { screen, router } = await renderApp(
      '/p/WEB/board?type=bug&label=%5B%22ui%22%5D&epic=none&q=login&recently_updated=true&column=2'
    )

    await expect
      .element(screen.getByRole('searchbox', { name: 'Filter issues' }))
      .toHaveValue('login')
    await expect.element(screen.getByLabelText('Epic')).toHaveValue('none')
    expect(boardQueries(requests)).toEqual([
      '?type=bug&label=ui&parent=none&q=login&recently_updated=true',
    ])
    const clear = screen.getByRole('link', { name: 'Clear filters' })
    await expect.element(clear).toHaveTextContent('Clear filters (5)')

    await clear.click()

    await expect.poll(() => router.state.location.search).toEqual({ column: 2 })
    await expect
      .element(screen.getByRole('searchbox', { name: 'Filter issues' }))
      .toHaveValue('')
  })

  it('tucks label, epic and recent into "More filters" on a narrow desktop', async () => {
    await page.viewport(1024, 800)
    inProjects(EPICS)
    const { screen } = await renderApp('/p/WEB/board')

    await screen.getByRole('button', { name: 'More filters' }).click()

    await expect
      .element(screen.getByRole('button', { name: 'Recently updated' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('combobox', { name: 'Epic' }))
      .toBeVisible()
  })

  it('gives a phone one Filters button that opens the controls in a sheet', async () => {
    await page.viewport(375, 800)
    const requests = inProjects()
    const { screen, router } = await renderApp(
      '/p/WEB/board?recently_updated=true'
    )

    expect(
      screen.getByRole('button', { name: 'Only my issues' }).elements()
    ).toHaveLength(0)
    const filters = screen.getByRole('button', { name: 'Filters' })
    await expect.element(filters).toHaveTextContent('Filters (1)')

    await filters.click()
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    await sheet.getByRole('button', { name: 'Only my issues' }).click()

    await expect
      .poll(() => router.state.location.search)
      .toEqual({ assignee: [1], recently_updated: true })
    await expect
      .poll(() => boardQueries(requests))
      .toContain('?assignee=1&recently_updated=true')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect.element(filters).toHaveTextContent('Filters (2)')
  })
})
