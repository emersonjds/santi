import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  OPS,
  OPS_BOARD,
  OPS_SETTINGS,
  WEB_BOARD,
  inProjects,
  routeOf,
} from '@/test/stub-api'

describe('board page', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('draws the running sprint and every card field', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    const sprint = screen.getByRole('region', { name: 'Active sprint' })
    await expect.element(sprint).toHaveTextContent('Sprint 4')
    await expect.element(sprint).toHaveTextContent('Ship the board')
    await expect.element(sprint).toHaveTextContent('3 days left')

    const todo = screen.getByRole('region', { name: 'To do' })
    await expect.element(todo.getByLabelText('2 issues')).toBeVisible()
    const bug = todo.getByRole('article').nth(1)
    await expect
      .element(bug.getByRole('link', { name: 'Fix the login redirect loop' }))
      .toHaveAttribute('href', expect.stringMatching(/\/p\/WEB\/issues\/2$/))
    await expect.element(bug).toHaveTextContent('WEB-2')
    await expect
      .element(bug.getByText('Bug', { exact: true }))
      .toBeInTheDocument()
    await expect.element(bug.getByText('Urgent priority')).toBeInTheDocument()
    await expect.element(bug.getByLabelText('3 points')).toBeVisible()
    await expect
      .element(bug.getByTitle('1 of 2 subtasks open'))
      .toHaveTextContent('1/2')
    await expect
      .element(bug.getByTitle('Assigned to Bob Stone'))
      .toHaveTextContent('BS')
    await expect
      .element(bug.getByTitle('Updated 3 hours ago'))
      .toBeInTheDocument()

    const doing = screen.getByRole('region', { name: 'In progress' })
    await expect.element(doing.getByText('WEB-2')).toBeVisible()
    await expect
      .element(screen.getByRole('region', { name: 'Done' }))
      .toHaveTextContent('Drop issues here')
  })

  it('shows two labels on a card, then how many more, on its one meta line', async () => {
    inProjects({
      'GET /api/projects/WEB/board': {
        status: 200,
        body: {
          ...WEB_BOARD,
          columns: WEB_BOARD.columns.map((column) => ({
            ...column,
            cards: column.cards.map((each) =>
              each.key === 'WEB-2'
                ? { ...each, labels: ['ui', 'docs', 'api'] }
                : each
            ),
          })),
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    const todo = screen.getByRole('region', { name: 'To do' })
    const bug = todo.getByRole('article').nth(1)
    await expect.element(bug.getByTitle('ui', { exact: true })).toBeVisible()
    await expect.element(bug.getByTitle('docs', { exact: true })).toBeVisible()
    await expect
      .element(bug.getByText('+1', { exact: true }))
      .toHaveAttribute('title', 'api')
    expect(bug.getByTitle('api', { exact: true }).elements()).toHaveLength(1)
    const meta = bug.getByText('WEB-2', { exact: true }).element().parentElement
    expect(meta?.getBoundingClientRect().height).toBeLessThanOrEqual(24)
    expect(
      todo.getByRole('article').first().getByText(/^\+\d/).elements()
    ).toHaveLength(0)
  })

  it('warns on a column over its limit and tells when done work leaves', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/board')

    const doing = screen.getByRole('region', { name: 'Doing' })
    await expect
      .element(doing.getByTitle('Over the limit of 1'))
      .toHaveTextContent('Max 1')
    const done = screen.getByRole('region', { name: 'Done' })
    await expect.element(done.getByText('Max 5')).toBeVisible()
    expect(done.getByTitle(/Over the limit/).elements()).toHaveLength(0)
    await expect
      .element(done)
      .toHaveTextContent(
        'Done issues leave the board 14 days after they finish.'
      )
    expect(
      screen.getByRole('region', { name: 'Active sprint' }).elements()
    ).toHaveLength(0)
  })

  it('lets an admin set a column limit from its header, shown at once (KB-16, D7)', async () => {
    const PUT = 'PUT /api/projects/OPS/board/columns/2'
    const requests = inProjects({
      'GET /api/projects/OPS': { status: 200, body: { ...OPS, role: 'admin' } },
      'GET /api/projects/OPS/board/settings': {
        status: 200,
        body: {
          ...OPS_SETTINGS,
          columns: OPS_SETTINGS.columns.map((column, index) => ({
            ...column,
            name: OPS_BOARD.columns[index].name,
            wip_limit: OPS_BOARD.columns[index].wip_limit,
          })),
        },
      },
      [PUT]: { status: 200, body: {}, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/p/OPS/board')
    const doing = screen.getByRole('region', { name: 'Doing' })

    await doing
      .getByRole('button', { name: 'Actions for column Doing' })
      .click()
    await screen.getByRole('menuitem', { name: 'Set WIP limit' }).click()
    const limit = doing.getByLabelText('WIP limit of Doing')
    await expect.element(limit).toHaveValue(1)
    await limit.fill('3')
    await userEvent.keyboard('{Enter}')

    await expect.element(doing.getByText('Max 3')).toBeVisible()
    expect(doing.getByTitle(/Over the limit/).elements()).toHaveLength(0)
    expect(doing.getByLabelText('WIP limit of Doing').elements()).toHaveLength(
      0
    )
    const put = requests.find((request) => routeOf(request) === PUT)
    expect(await put?.json()).toEqual({ name: 'Doing', wip_limit: 3 })
  })

  it('keeps the column menu to admins of kanban boards', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/board')
    await expect.element(screen.getByText('Patch the gateway')).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Actions for column/ }).elements()
    ).toHaveLength(0)

    await screen.getByRole('link', { name: 'Website' }).first().click()
    await expect.element(screen.getByText('WEB-1')).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Actions for column/ }).elements()
    ).toHaveLength(0)
  })

  it.each([
    [{ end_date: new Date().toLocaleDateString('sv') }, 'Ends today'],
    [
      { end_date: new Date(Date.now() + 86_400_000).toLocaleDateString('sv') },
      '1 day left',
    ],
    [{ overdue: true }, 'Overdue'],
  ])('tells how long the sprint has left: %o', async (change, text) => {
    inProjects({
      'GET /api/projects/WEB/board': {
        status: 200,
        body: { ...WEB_BOARD, sprint: { ...WEB_BOARD.sprint, ...change } },
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await expect
      .element(screen.getByRole('region', { name: 'Active sprint' }))
      .toHaveTextContent(text)
  })

  it('completes the running sprint from the header menu (R-4)', async () => {
    const requests = inProjects({
      'POST /api/projects/WEB/sprints/4/complete': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await screen.getByRole('button', { name: 'More for Sprint 4' }).click()
    await screen.getByRole('menuitem', { name: 'Complete sprint' }).click()
    const dialog = screen.getByRole('dialog', { name: 'Complete Sprint 4' })
    // Parents only, as the backlog counts them: the subtask WEB-3 follows WEB-2.
    await expect.element(dialog).toHaveTextContent('0 issues done · 2 open')
    await dialog.getByRole('radio', { name: 'Sprint 5' }).click()
    await dialog.getByRole('button', { name: 'Complete sprint' }).click()

    await expect.element(dialog).not.toBeInTheDocument()
    const post = requests.find(
      (request) =>
        routeOf(request) === 'POST /api/projects/WEB/sprints/4/complete'
    )
    expect(await post?.json()).toEqual({
      open_issues: { to: 'sprint', sprint_id: 5 },
    })
  })

  it('points to the backlog when no sprint is running', async () => {
    inProjects({
      'GET /api/projects/WEB/board': {
        status: 200,
        body: { ...WEB_BOARD, sprint: null },
      },
    })
    const { screen, router } = await renderApp('/p/WEB/board')

    await expect
      .element(screen.getByText('No sprint is running.'))
      .toBeVisible()
    await screen.getByRole('link', { name: 'Open backlog' }).click()
    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/WEB/backlog')
  })

  it('opens the issue over the board when its card is clicked, under the issue URL', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    await screen.getByRole('link', { name: 'Write the release notes' }).click()

    await expect
      .poll(() => router.state.location.maskedLocation?.pathname)
      .toBe('/p/WEB/issues/1')
    expect(router.state.location.search).toEqual({ issue: 1 })
  })

  it('holds the board layout with a skeleton while it loads', async () => {
    inProjects({
      'GET /api/projects/WEB/board': {
        status: 200,
        body: WEB_BOARD,
        until: new Promise(() => {}),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await expect
      .element(screen.getByRole('status', { name: 'Loading board' }))
      .toBeVisible()
  })

  it('stretches its columns to fill a wide screen, up to 26rem each', async () => {
    await page.viewport(1440, 900)
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    const columns = screen.getByRole('region', { name: 'Board' })
    const done = screen.getByRole('region', { name: 'Done' })
    await expect.element(done).toBeVisible()
    const board = columns.element().getBoundingClientRect()
    const last = done.element().getBoundingClientRect()
    // 24px is the board's padding: the last column ends at the content edge.
    expect(Math.round(board.right - last.right)).toBe(24)
    expect(last.width).toBeGreaterThan(288)

    await page.viewport(2560, 900)
    await expect
      .poll(() => done.element().getBoundingClientRect().width)
      .toBe(416)
  })

  it('keeps every column at least 18rem wide, scrolling the board sideways instead', async () => {
    await page.viewport(900, 800)
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    const done = screen.getByRole('region', { name: 'Done' })
    await expect.element(done).toBeInTheDocument()
    expect(done.element().getBoundingClientRect().width).toBe(288)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(900)
  })
})
