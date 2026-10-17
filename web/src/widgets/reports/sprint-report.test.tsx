import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Sprint, SprintReport, SprintTotals } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import { inProjects, problem, sprintReport } from '@/test/stub-api'

const HISTORY = 'GET /api/projects/WEB/reports/sprints'
const report = (id: number) => `GET /api/projects/WEB/sprints/${id}/report`

const GOAL = 'Ship the login page'

const totals = (id: number, sprint: Partial<Sprint> = {}): SprintTotals => ({
  sprint: { ...sprintReport(id).sprint, ...sprint },
  committed: 8,
  completed: 5,
})

const HISTORY_OK = {
  status: 200,
  body: {
    items: [totals(4, { state: 'active' }), totals(3), totals(2)],
    next_cursor: null,
  },
}

const ok = (body: SprintReport) => ({ status: 200, body })

/** Sprint 2 is the oldest, Sprint 4 the running one; each report knows its neighbors. */
const THREE_SPRINTS = {
  [HISTORY]: HISTORY_OK,
  [report(2)]: ok(sprintReport(2, { newer_sprint_id: 3 })),
  [report(3)]: ok(
    sprintReport(3, {
      sprint: { ...sprintReport(3).sprint, goal: GOAL },
      newer_sprint_id: 4,
      older_sprint_id: 2,
    })
  ),
  [report(4)]: ok(
    sprintReport(4, {
      sprint: { ...sprintReport(4).sprint, state: 'active' },
      older_sprint_id: 3,
      completed: 2,
    })
  ),
}

const title = (screen: Awaited<ReturnType<typeof renderApp>>['screen']) =>
  screen.getByRole('heading', { level: 1 })

describe('sprint report', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('heads the report with the sprint, its dates, goal and totals', async () => {
    inProjects(THREE_SPRINTS)
    const { screen } = await renderApp('/p/WEB/reports/3')

    await expect.element(title(screen)).toHaveTextContent('Sprint 3')
    const header = screen.getByRole('region', { name: 'Sprint 3' })
    await expect.element(header).toHaveTextContent('Sep 1 – Sep 14')
    await expect.element(header).toHaveTextContent(GOAL)
    await expect.element(header).toHaveTextContent('Committed8')
    await expect.element(header).toHaveTextContent('Completed5')
    await expect.element(header).not.toHaveTextContent('In progress')
  })

  it('tells a running sprint apart', async () => {
    inProjects(THREE_SPRINTS)
    const { screen } = await renderApp('/p/WEB/reports/4')

    await expect.element(title(screen)).toHaveTextContent('Sprint 4')
    await expect.element(screen.getByText('In progress')).toBeVisible()
    await expect
      .element(screen.getByText('Updates as the sprint moves.'))
      .toBeVisible()
  })

  it('walks to the neighbors, keeping focus and saying where it landed', async () => {
    inProjects(THREE_SPRINTS)
    const { screen, router } = await renderApp('/p/WEB/reports/3')
    const previous = screen.getByRole('button', { name: 'Previous sprint' })
    const next = screen.getByRole('button', { name: 'Next sprint' })

    await previous.click()

    await expect.element(title(screen)).toHaveTextContent('Sprint 2')
    expect(router.state.location.pathname).toBe('/p/WEB/reports/2')
    await expect.element(previous).toHaveAttribute('aria-disabled', 'true')
    await expect.element(previous).toHaveFocus()
    await expect
      .element(
        screen.getByRole('status').filter({ hasText: 'Now showing Sprint 2' })
      )
      .toBeInTheDocument()
    await previous.click({ force: true })
    expect(router.state.location.pathname).toBe('/p/WEB/reports/2')

    await next.click()
    await expect.element(title(screen)).toHaveTextContent('Sprint 3')
    await next.click()

    await expect.element(title(screen)).toHaveTextContent('Sprint 4')
    await expect.element(next).toHaveAttribute('aria-disabled', 'true')
    await expect.element(next).toHaveFocus()
    await expect.element(previous).not.toHaveAttribute('aria-disabled')
  })

  it('picks any started sprint from the list', async () => {
    inProjects(THREE_SPRINTS)
    const { screen, router } = await renderApp('/p/WEB/reports/3')

    await screen.getByRole('button', { name: /Choose sprint/ }).click()
    const options = screen.getByRole('option')
    await expect.element(options.first()).toHaveTextContent('Sprint 4')
    await expect.element(options.first()).toHaveTextContent('In progress')
    expect(options.elements()).toHaveLength(3)
    await screen.getByRole('option', { name: 'Sprint 2' }).click()

    await expect.element(title(screen)).toHaveTextContent('Sprint 2')
    expect(router.state.location.pathname).toBe('/p/WEB/reports/2')
  })

  it('tabs from the picker to previous, then next', async () => {
    inProjects(THREE_SPRINTS)
    const { screen } = await renderApp('/p/WEB/reports/3')
    const picker = screen.getByRole('button', { name: /Choose sprint/ })
    await expect.element(picker).toHaveTextContent('Sprint 3')

    picker.element().focus()
    await userEvent.tab()
    await expect
      .element(screen.getByRole('button', { name: 'Previous sprint' }))
      .toHaveFocus()
    await userEvent.tab()
    await expect
      .element(screen.getByRole('button', { name: 'Next sprint' }))
      .toHaveFocus()
  })

  it('offers a retry when the report fails, the arrows still working', async () => {
    inProjects({
      ...THREE_SPRINTS,
      [report(3)]: { status: 500, body: problem(500, 'boom') },
    })
    const { screen } = await renderApp('/p/WEB/reports/3')

    const alert = screen.getByRole('alert')
    await expect.element(alert).toHaveTextContent("Couldn't load this report.")
    inProjects(THREE_SPRINTS)
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect.element(title(screen)).toHaveTextContent('Sprint 3')
  })

  it('walks away from a report that failed', async () => {
    inProjects({
      ...THREE_SPRINTS,
      [report(3)]: { status: 500, body: problem(500, 'boom') },
    })
    const { screen } = await renderApp('/p/WEB/reports/3')

    await expect.element(screen.getByRole('alert')).toBeVisible()
    await screen.getByRole('button', { name: 'Previous sprint' }).click()

    await expect.element(title(screen)).toHaveTextContent('Sprint 2')
  })

  it('draws the header and groups as skeletons while loading', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => (answer = resolve))
    inProjects({ ...THREE_SPRINTS, [report(3)]: { ...THREE_SPRINTS[report(3)], until } })
    const { screen } = await renderApp('/p/WEB/reports/3')

    await expect
      .element(screen.getByRole('status', { name: 'Loading report' }))
      .toBeVisible()
    answer()

    await expect.element(title(screen)).toHaveTextContent('Sprint 3')
  })

  it('sends a kanban project to its board', async () => {
    inProjects()
    const { router } = await renderApp('/p/OPS/reports/1')

    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/OPS/board')
  })
})
