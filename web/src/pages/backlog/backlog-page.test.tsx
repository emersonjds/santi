import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Backlog, BacklogSection } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  WEB_BACKLOG,
  card,
  inProjects,
  issue,
  problem,
  routeOf,
} from '@/test/stub-api'

const [ACTIVE, PLANNED, EMPTY, NO_SPRINT] = WEB_BACKLOG.sections

const backlogOf = (...sections: BacklogSection[]): Backlog => ({
  ...WEB_BACKLOG,
  sections,
})

const withBacklog = (body: Backlog) =>
  inProjects({ 'GET /api/projects/WEB/backlog': { status: 200, body } })

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    card({ key: `WEB-${index + 100}`, summary: `Row ${index}`, column_id: 1 })
  )

describe('backlog page', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('stacks the running sprint, the planned ones, then the backlog, each with its header facts', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')

    const active = screen.getByRole('region', { name: 'Sprint 4' })
    await expect.element(active.getByText('Active')).toBeVisible()
    await expect
      .element(active.getByText('3 issues', { exact: true }))
      .toBeVisible()
    await expect.element(active.getByLabelText('2 to do')).toBeVisible()
    await expect.element(active.getByLabelText('1 in progress')).toBeVisible()
    await expect.element(active.getByLabelText('Total 3 points')).toBeVisible()
    await expect
      .element(active.getByRole('button', { name: 'Complete sprint' }))
      .toBeEnabled()
    await expect
      .element(active)
      .toHaveTextContent('3 of 3 issues visible · Estimate: 3 of 3')

    const planned = screen.getByRole('region', { name: 'Sprint 5' })
    await expect
      .element(planned.getByRole('button', { name: 'Add dates' }))
      .toBeVisible()
    await expect
      .element(planned.getByRole('button', { name: 'Start sprint' }))
      .toBeDisabled()
    await expect
      .element(planned)
      .toHaveTextContent('Complete Sprint 4 before starting another.')

    const empty = screen.getByRole('region', { name: 'Sprint 6' })
    await expect.element(empty).toHaveTextContent('0 issues')
    await expect
      .element(empty)
      .toHaveTextContent('Drag issues here to plan this sprint.')

    const backlog = screen.getByRole('region', { name: 'Backlog' })
    await expect
      .element(backlog.getByRole('button', { name: 'Create sprint' }))
      .toBeVisible()
    await expect
      .element(backlog)
      .toHaveTextContent('2 of 2 issues visible · Estimate: 2 of 2')
    const order = screen
      .getByRole('heading', { level: 2 })
      .elements()
      .map((heading) => heading.textContent)
    expect(order).toEqual(['Sprint 4', 'Sprint 5', 'Sprint 6', 'Backlog'])
  })

  it('draws a dense row: type, key, summary, epic, status, points and assignee', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')

    const planned = screen.getByRole('region', { name: 'Sprint 5' })
    const row = planned.getByRole('listitem').first()
    await expect.element(row).toHaveTextContent('WEB-4')
    await expect
      .element(row.getByRole('link', { name: 'Pay with a saved card' }))
      .toHaveAttribute('href', expect.stringMatching(/\/p\/WEB\/issues\/4$/))
    await expect.element(row.getByTitle('Epic Checkout revamp')).toBeVisible()
    await expect.element(row.getByText('To do', { exact: true })).toBeVisible()
    await expect.element(row.getByLabelText('5 points')).toBeVisible()

    const bug = screen
      .getByRole('region', { name: 'Sprint 4' })
      .getByRole('listitem')
      .nth(1)
    await expect
      .element(bug.getByText('Bug', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(bug.getByTitle('Assigned to Bob Stone'))
      .toHaveTextContent('BS')
  })

  it('lets a planned sprint start only when no other runs and it holds an issue', async () => {
    withBacklog(backlogOf(PLANNED, EMPTY, NO_SPRINT))
    const { screen } = await renderApp('/p/WEB/backlog')

    await expect
      .element(
        screen
          .getByRole('region', { name: 'Sprint 5' })
          .getByRole('button', { name: 'Start sprint' })
      )
      .toBeEnabled()
    const empty = screen.getByRole('region', { name: 'Sprint 6' })
    await expect
      .element(empty.getByRole('button', { name: 'Start sprint' }))
      .toBeDisabled()
    await expect
      .element(empty)
      .toHaveTextContent('Add an issue before starting.')
  })

  it('flags an overdue sprint and shows planned dates', async () => {
    withBacklog(
      backlogOf(
        {
          ...ACTIVE,
          sprint: {
            ...ACTIVE.sprint!,
            overdue: true,
            start_date: '2026-03-02',
            end_date: '2026-03-16',
          },
        },
        NO_SPRINT
      )
    )
    const { screen } = await renderApp('/p/WEB/backlog')

    const active = screen.getByRole('region', { name: 'Sprint 4' })
    await expect.element(active.getByText('Overdue')).toBeVisible()
    await expect.element(active).toHaveTextContent('Mar 2 – Mar 16')
  })

  it('collapses a section from its header', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')

    const toggle = screen.getByRole('button', { name: 'Sprint 4', exact: true })
    await toggle.click()

    await expect.element(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect
      .element(screen.getByRole('link', { name: 'Write the release notes' }))
      .not.toBeInTheDocument()

    await toggle.click()
    await expect
      .element(screen.getByRole('link', { name: 'Write the release notes' }))
      .toBeVisible()
  })

  it('applies the board filters from the URL and counts what they hide', async () => {
    const requests = withBacklog(
      backlogOf({ ...NO_SPRINT, cards: NO_SPRINT.cards.slice(1) })
    )
    const { screen } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('button', { name: 'Only my issues' }).click()
    await screen.getByRole('button', { name: 'Recently updated' }).click()

    await expect
      .poll(() =>
        requests
          .filter(
            (request) => routeOf(request) === 'GET /api/projects/WEB/backlog'
          )
          .map((request) => new URL(request.url).search)
      )
      .toContain('?assignee=1&recently_updated=true')
    await expect
      .element(screen.getByRole('region', { name: 'Backlog' }))
      .toHaveTextContent('1 of 2 issues visible · Estimate: 2 of 2')
  })

  it('says so when the filters hide every issue', async () => {
    withBacklog(backlogOf({ ...NO_SPRINT, cards: [] }))
    const { screen } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('button', { name: 'Recently updated' }).click()

    await expect
      .element(screen.getByText('No issues match these filters.'))
      .toBeVisible()
  })

  it('opens the issue over the backlog, under the issue URL', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('link', { name: 'Write the release notes' }).click()

    await expect
      .poll(() => router.state.location.maskedLocation?.pathname)
      .toBe('/p/WEB/issues/1')
    expect(router.state.location.search).toEqual({ issue: 1 })
    await expect
      .element(screen.getByRole('dialog', { name: 'WEB-1' }))
      .toBeVisible()
  })

  it('draws every row up to 200 and only the visible ones beyond', async () => {
    withBacklog(backlogOf({ ...NO_SPRINT, issue_count: 200, cards: rows(200) }))
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })
    await expect.element(backlog.getByText('Row 199')).toBeInTheDocument()
    expect(backlog.getByRole('link').elements()).toHaveLength(200)
  })

  it('virtualizes a section of more than 200 rows', async () => {
    withBacklog(
      backlogOf({ ...NO_SPRINT, issue_count: 1000, cards: rows(1000) })
    )
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })
    await expect
      .element(backlog.getByText('Row 0', { exact: true }))
      .toBeVisible()

    // Scrolls again until the virtualizer's chunk has loaded and drawn the end of the list.
    await expect
      .poll(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        return backlog.getByText('Row 999', { exact: true }).elements()
      })
      .toHaveLength(1)
    const drawn = backlog.getByRole('link').elements().length
    expect(drawn).toBeGreaterThan(5)
    expect(drawn).toBeLessThan(100)
    await expect
      .element(backlog)
      .toHaveTextContent('1000 of 1000 issues visible')
  })

  it('shows the error page when the backlog fails to load', async () => {
    inProjects({
      'GET /api/projects/WEB/backlog': {
        status: 500,
        body: problem(500, 'The database is away.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await expect
      .element(screen.getByText('The database is away.'))
      .toBeVisible()
  })

  it('holds the layout with a skeleton while the backlog loads', async () => {
    inProjects({
      'GET /api/projects/WEB/backlog': {
        status: 200,
        body: WEB_BACKLOG,
        until: new Promise(() => {}),
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await expect
      .element(screen.getByRole('status', { name: 'Loading backlog' }))
      .toBeVisible()
  })

  it('creates inline at the foot of a sprint, into that sprint', async () => {
    const created = issue({
      key: 'WEB-12',
      summary: 'Store the card token',
      sprint_id: 5,
    })
    // The refetch after the create brings the new row from the server too.
    let reads = 0
    const after = backlogOf(
      ACTIVE,
      {
        ...PLANNED,
        issue_count: 2,
        cards: [...PLANNED.cards, card({ ...created, column_id: 1 })],
      },
      EMPTY,
      NO_SPRINT
    )
    const requests = inProjects({
      'POST /api/projects/WEB/issues': { status: 201, body: created },
      'GET /api/projects/WEB/backlog': {
        status: 200,
        body: () => (reads++ === 0 ? WEB_BACKLOG : after),
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')
    const planned = screen.getByRole('region', { name: 'Sprint 5' })

    await planned.getByRole('button', { name: 'Create issue' }).click()
    await planned.getByLabelText('New issue type').selectOptions('Bug')
    await planned
      .getByLabelText('New issue summary')
      .fill('Store the card token')
    await userEvent.keyboard('{Enter}')

    await expect.element(planned).toHaveTextContent('Store the card token')
    await expect.element(planned).toHaveTextContent('2 of 2 issues visible')
    await expect
      .element(planned.getByLabelText('New issue summary'))
      .toHaveValue('')
    await userEvent.keyboard('{Escape}')
    await expect
      .element(planned.getByRole('button', { name: 'Create issue' }))
      .toBeVisible()
    const posted = requests.find(
      (request) => routeOf(request) === 'POST /api/projects/WEB/issues'
    )
    expect(await posted?.clone().json()).toEqual({
      summary: 'Store the card token',
      issue_type: 'bug',
      sprint_id: 5,
      status_id: 10,
    })
  })

  it('creates inline in the backlog with no sprint', async () => {
    const created = issue({
      key: 'WEB-12',
      summary: 'Plan the launch',
      sprint_id: null,
    })
    let reads = 0
    const after = backlogOf(ACTIVE, PLANNED, EMPTY, {
      ...NO_SPRINT,
      issue_count: 3,
      cards: [...NO_SPRINT.cards, card({ ...created, column_id: 1 })],
    })
    const requests = inProjects({
      'POST /api/projects/WEB/issues': { status: 201, body: created },
      'GET /api/projects/WEB/backlog': {
        status: 200,
        body: () => (reads++ === 0 ? WEB_BACKLOG : after),
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: 'Create issue' }).click()
    await backlog.getByLabelText('New issue summary').fill('Plan the launch')
    await userEvent.keyboard('{Enter}')

    await expect.element(backlog).toHaveTextContent('Plan the launch')
    const posted = requests.find(
      (request) => routeOf(request) === 'POST /api/projects/WEB/issues'
    )
    expect(await posted?.clone().json()).toEqual({
      summary: 'Plan the launch',
      issue_type: 'story',
      status_id: 10,
    })
  })
})
