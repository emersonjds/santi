import { beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { WEB_BOARD, inProjects } from '@/test/stub-api'

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
    const bug = todo.getByRole('listitem').nth(1)
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

  it('opens the issue when its card is clicked', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    await screen.getByRole('link', { name: 'Write the release notes' }).click()

    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/WEB/issues/1')
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
})
