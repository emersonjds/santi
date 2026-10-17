import { beforeEach, describe, expect, it } from 'vitest'
import { type Locator, page } from 'vitest/browser'
import type { Sprint, SprintTotals } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  WEB,
  inProjects,
  problem,
  routeOf,
  sprintReport,
} from '@/test/stub-api'

const HISTORY = 'GET /api/projects/WEB/reports/sprints'
const VELOCITY = 'GET /api/projects/WEB/reports/velocity'

const totals = (
  id: number,
  sprint: Partial<Sprint> = {},
  committed: number | null = 8,
  completed: number | null = 5
): SprintTotals => ({
  sprint: {
    id,
    name: `Sprint ${id}`,
    goal: '',
    state: 'closed',
    overdue: false,
    start_date: '2026-09-01',
    end_date: '2026-09-14',
    ...sprint,
  },
  committed,
  completed,
})

const GOAL = 'Ship the login page and the password reset flow for every user'

const ACTIVE = totals(4, { state: 'active', goal: GOAL }, 13, 3)
const CLOSED = [totals(3), totals(2, {}, null, null)]

const page1 = (items: SprintTotals[], next_cursor: number | null = null) => ({
  status: 200,
  body: { items, next_cursor },
})

const VELOCITY_OK = {
  status: 200,
  body: { sprints: [totals(2), totals(3)], average_completed: 5 },
}

const sprints = (screen: Pick<Locator, 'getByRole'>) =>
  screen.getByRole('region', { name: 'Sprints' }).getByRole('list')

const sprintList = () =>
  document.querySelector<HTMLElement>('section[aria-label="Sprints"] ul')

describe('reports page', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('lists the active sprint first, then the closed ones with their totals', async () => {
    inProjects({
      [HISTORY]: page1([ACTIVE, ...CLOSED]),
      [VELOCITY]: VELOCITY_OK,
    })
    const { screen } = await renderApp('/p/WEB/reports')

    await expect
      .element(screen.getByRole('heading', { name: 'Reports', level: 1 }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('heading', { name: 'Velocity' }))
      .toBeVisible()
    const rows = sprints(screen).getByRole('listitem')
    await expect.element(rows.first()).toHaveTextContent('Sprint 4')
    await expect.element(sprints(screen)).not.toHaveAccessibleName()
    await expect.element(rows.first()).toHaveTextContent('In progress')
    await expect.element(rows.first()).toHaveTextContent('Committed13')
    await expect.element(rows.first()).toHaveTextContent('Completed3')
    await expect.element(rows.nth(1)).toHaveTextContent('Sep 1 – Sep 14')
    await expect.element(rows.nth(1)).not.toHaveTextContent('In progress')
    await expect.element(rows.nth(2)).toHaveTextContent('Committed—')
    await expect.element(rows.nth(2)).toHaveTextContent('Completed—')
    const goal = rows.first().getByTitle(GOAL)
    await expect.element(goal).toHaveTextContent(GOAL)
    await expect.element(goal).toHaveClass('truncate')
  })

  it('opens a sprint report from anywhere on its row', async () => {
    inProjects({
      [HISTORY]: page1([ACTIVE, ...CLOSED]),
      [VELOCITY]: VELOCITY_OK,
      'GET /api/projects/WEB/sprints/3/report': {
        status: 200,
        body: sprintReport(3),
      },
    })
    const { screen, router } = await renderApp('/p/WEB/reports')

    const row = sprints(screen).getByRole('listitem').nth(1)
    const link = row.getByRole('link', { name: 'Sprint 3' })
    await expect.element(link).toHaveAttribute('href', '/p/WEB/reports/3')
    const box = row.element().getBoundingClientRect()
    await row.click({ position: { x: box.width - 8, y: box.height / 2 } })

    await expect
      .element(screen.getByRole('heading', { name: 'Sprint 3', level: 1 }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/reports/3')
  })

  it('points to the backlog when no sprint has started', async () => {
    inProjects({
      [HISTORY]: page1([]),
      [VELOCITY]: {
        status: 200,
        body: { sprints: [], average_completed: null },
      },
    })
    const { screen } = await renderApp('/p/WEB/reports')

    const empty = screen.getByRole('region', { name: 'Sprints' })
    await expect
      .element(empty.getByText('No sprint has finished yet.'))
      .toBeVisible()
    await expect
      .element(empty.getByRole('link', { name: 'Go to Backlog' }))
      .toHaveAttribute('href', '/p/WEB/backlog')
  })

  it('loads the next sprints on demand', async () => {
    let call = 0
    const requests = inProjects({
      [HISTORY]: {
        status: 200,
        body: () =>
          call++ === 0
            ? { items: [ACTIVE, CLOSED[0]], next_cursor: 3 }
            : { items: [CLOSED[1]], next_cursor: null },
      },
      [VELOCITY]: VELOCITY_OK,
    })
    const { screen } = await renderApp('/p/WEB/reports')

    await screen.getByRole('button', { name: 'Show more' }).click()

    await expect.element(sprints(screen).getByText('Sprint 2')).toBeVisible()
    const last = requests
      .filter((request) => routeOf(request) === HISTORY)
      .at(-1)
    expect(new URL(last?.url ?? '').searchParams.get('cursor')).toBe('3')
    expect(new URL(last?.url ?? '').searchParams.get('limit')).toBe('50')
    expect(
      screen.getByRole('button', { name: 'Show more' }).elements()
    ).toHaveLength(0)
  })

  it('offers a retry when the list fails, keeping the chart', async () => {
    inProjects({
      [HISTORY]: { status: 500, body: problem(500, 'boom') },
      [VELOCITY]: VELOCITY_OK,
    })
    const { screen } = await renderApp('/p/WEB/reports')

    const alert = screen.getByRole('alert')
    await expect.element(alert).toHaveTextContent("Couldn't load reports.")
    await expect.element(screen.getByText('View as table')).toBeVisible()
    inProjects({ [HISTORY]: page1(CLOSED), [VELOCITY]: VELOCITY_OK })
    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect.element(sprints(screen).getByText('Sprint 3')).toBeVisible()
  })

  it('offers a retry when the chart fails, keeping the list', async () => {
    inProjects({
      [HISTORY]: page1(CLOSED),
      [VELOCITY]: { status: 500, body: problem(500, 'boom') },
    })
    const { screen } = await renderApp('/p/WEB/reports')

    const alert = screen.getByRole('alert')
    await expect.element(alert).toHaveTextContent("Couldn't load velocity.")
    await expect.element(sprints(screen).getByText('Sprint 3')).toBeVisible()
    inProjects({ [HISTORY]: page1(CLOSED), [VELOCITY]: VELOCITY_OK })
    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect.element(screen.getByText('View as table')).toBeVisible()
  })

  it('draws skeletons of the final height while loading', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => (answer = resolve))
    inProjects({
      [HISTORY]: { ...page1(CLOSED), until },
      [VELOCITY]: { ...VELOCITY_OK, until },
    })
    const { screen } = await renderApp('/p/WEB/reports')

    await expect
      .element(screen.getByRole('status', { name: 'Loading sprints' }))
      .toBeVisible()
    const velocity = screen.getByRole('region', { name: 'Velocity' })
    await expect
      .element(velocity.getByRole('status', { name: 'Loading velocity' }))
      .toBeVisible()
    const loading = velocity.element().getBoundingClientRect().height
    answer()

    await expect.element(velocity.getByText('View as table')).toBeVisible()
    expect(velocity.element().getBoundingClientRect().height).toBe(loading)
  })

  it('fits 375px with rows a thumb can hit', async () => {
    await page.viewport(375, 800)
    inProjects({
      [HISTORY]: page1([ACTIVE, ...CLOSED]),
      [VELOCITY]: {
        status: 200,
        body: {
          sprints: [1, 2, 3, 4, 5, 6, 7].map((id) => totals(id)),
          average_completed: 5,
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/reports')

    await expect.element(sprints(screen).getByText('Sprint 4')).toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    const rows = [...(sprintList()?.children ?? [])]
    expect(rows).toHaveLength(3)
    for (const row of rows)
      expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })

  it('stays readable on an archived project', async () => {
    inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived' },
      },
      [HISTORY]: page1(CLOSED),
      [VELOCITY]: VELOCITY_OK,
    })
    const { screen } = await renderApp('/p/WEB/reports')

    await expect
      .element(
        screen
          .getByRole('status')
          .filter({ hasText: 'This project is archived and read-only' })
      )
      .toBeVisible()
    await expect.element(sprints(screen).getByText('Sprint 3')).toBeVisible()
    await expect.element(screen.getByText('View as table')).toBeVisible()
  })
})
