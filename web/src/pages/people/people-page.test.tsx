import { beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import type { Card } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  WEB_BOARD,
  WEB_PEOPLE,
  card,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const PEOPLE = 'GET /api/projects/WEB/people'

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000 - 60_000).toISOString()

const boardOf = (cards: Card[]) => ({
  ...WEB_BOARD,
  columns: WEB_BOARD.columns.map((column) => ({
    ...column,
    cards: cards.filter((each) => each.column_id === column.id),
  })),
})

const BOB = { assignee_id: 2, assignee_name: 'Bob Stone' }

// Board order: the review card is listed first in its column, the stuck one after it.
const BOB_BOARD = boardOf([
  card({
    key: 'WEB-8',
    summary: 'Review the copy',
    column_id: 2,
    status_id: 21,
    ...BOB,
  }),
  card({
    key: 'WEB-5',
    summary: 'Move the session store',
    column_id: 2,
    status_id: 20,
    updated_at: daysAgo(5),
    ...BOB,
  }),
  card({
    key: 'WEB-2',
    summary: 'Fix the login redirect loop',
    column_id: 1,
    ...BOB,
  }),
])

const UNASSIGNED_BOARD = boardOf([
  card({ key: 'WEB-1', summary: 'Write the release notes', column_id: 1 }),
])

const BOARD_BY_PERSON = {
  'GET /api/projects/WEB/board': {
    status: 200,
    body: (request: Request) => {
      const query = new URL(request.url).searchParams
      if (query.get('assignee') === '2') return BOB_BOARD
      if (query.get('unassigned') === 'true') return UNASSIGNED_BOARD
      return WEB_BOARD
    },
  },
}

const boardQueries = (requests: Request[]) =>
  requests
    .filter((request) => routeOf(request) === 'GET /api/projects/WEB/board')
    .map((request) => new URL(request.url).search)

const rowList = (screen: Awaited<ReturnType<typeof renderApp>>['screen']) =>
  screen.getByRole('list', { name: 'People' })

describe('people page', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('lists each person of the running sprint in the order given, with counts, bar text and stuck badge', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/people')

    await expect
      .element(screen.getByRole('heading', { name: 'People', level: 1 }))
      .toBeVisible()
    await expect.element(screen.getByText(/^Sprint 4 · /)).toBeVisible()
    const rows = rowList(screen).getByRole('button')
    await expect.element(rows.first()).toHaveTextContent('Bob Stone')
    expect(rows.elements().map((row) => row.textContent)).toEqual([
      'BSBob StoneStuck ×23/8 issues · 5/13 pts2 to do, 3 in progress, 3 done',
      'AAlice0/2 issues · 0/0 pts1 to do, 1 in progress, 0 done',
      'Unassigned0/1 issues · 0/0 pts1 to do, 0 in progress, 0 done',
    ])
    await expect
      .element(screen.getByTitle('No update in 3 or more days'))
      .toHaveTextContent('Stuck ×2')
    expect(
      rows.elements().map((row) => row.getAttribute('aria-expanded'))
    ).toEqual(['false', 'false', 'false'])
  })

  it('expands a person to list their issues in board order and links to their board, then collapses', async () => {
    const requests = inProjects(BOARD_BY_PERSON)
    const { screen } = await renderApp('/p/WEB/people')

    const bob = screen.getByRole('button', { name: /Bob Stone/ })
    await bob.click()

    await expect.element(bob).toHaveAttribute('aria-expanded', 'true')
    const issues = screen.getByRole('list', { name: 'Issues of Bob Stone' })
    await expect.element(issues).toBeVisible()
    await expect
      .poll(() =>
        issues
          .getByRole('listitem')
          .elements()
          .map((item) => item.textContent)
      )
      .toEqual([
        'WEB-2Fix the login redirect loopTo do',
        'WEB-8Review the copyIn review',
        'WEB-5Move the session storeIn progress5 days since update',
      ])
    expect(boardQueries(requests)).toContain('?assignee=2')
    await expect
      .element(screen.getByRole('link', { name: 'Show on board' }))
      .toHaveAttribute('href', '/p/WEB/board?assignee=%5B2%5D')

    await bob.click()

    await expect.element(bob).toHaveAttribute('aria-expanded', 'false')
    expect(issues.elements()).toHaveLength(0)
  })

  it('expands Unassigned to the issues nobody has, with its board link', async () => {
    const requests = inProjects(BOARD_BY_PERSON)
    const { screen } = await renderApp('/p/WEB/people')

    await screen.getByRole('button', { name: /^Unassigned/ }).click()

    await expect
      .element(screen.getByRole('list', { name: 'Issues of Unassigned' }))
      .toHaveTextContent('WEB-1Write the release notesTo do')
    expect(boardQueries(requests)).toContain('?unassigned=true')
    await expect
      .element(screen.getByRole('link', { name: 'Show on board' }))
      .toHaveAttribute('href', '/p/WEB/board?unassigned=true')
  })

  it('holds five skeleton rows while the people load', async () => {
    inProjects({ [PEOPLE]: { status: 200, until: new Promise(() => {}) } })
    const { screen } = await renderApp('/p/WEB/people')

    const loading = screen.getByRole('status', { name: 'Loading people' })
    await expect.element(loading).toBeVisible()
    expect(loading.element().children).toHaveLength(5)
  })

  it('says when the people did not load and tries again', async () => {
    inProjects({ [PEOPLE]: { status: 500, body: problem(500, 'Down.') } })
    const { screen } = await renderApp('/p/WEB/people')

    const alert = screen.getByRole('alert')
    await expect.element(alert).toHaveTextContent('People did not load.')

    inProjects()
    await alert.getByRole('button', { name: 'Try again' }).click()

    await expect
      .element(rowList(screen).getByRole('button').first())
      .toHaveTextContent('Bob Stone')
  })

  it('points to the backlog when no sprint is running', async () => {
    inProjects({
      [PEOPLE]: { status: 200, body: { sprint: null, people: [] } },
    })
    const { screen } = await renderApp('/p/WEB/people')

    await expect
      .element(screen.getByText('No sprint is running.'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'Go to Backlog' }))
      .toHaveAttribute('href', '/p/WEB/backlog')
  })

  it("rounds a person's total points", async () => {
    const [first] = WEB_PEOPLE.people
    inProjects({
      [PEOPLE]: {
        status: 200,
        body: {
          ...WEB_PEOPLE,
          people: [
            {
              ...first,
              stuck: 0,
              to_do: { issues: 1, points: 0.1 },
              in_progress: { issues: 1, points: 0.2 },
              done: { issues: 0, points: 0 },
            },
          ],
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/people')

    await expect
      .element(rowList(screen).getByRole('button'))
      .toHaveTextContent('0/2 issues · 0/0.3 pts')
  })

  it('says a running sprint has no issues yet', async () => {
    inProjects({
      [PEOPLE]: { status: 200, body: { ...WEB_PEOPLE, people: [] } },
    })
    const { screen } = await renderApp('/p/WEB/people')

    await expect
      .element(screen.getByText('This sprint has no issues yet.'))
      .toBeVisible()
    expect(
      screen.getByRole('list', { name: 'People' }).elements()
    ).toHaveLength(0)
  })

  it('shows a kanban board by person, from a tab after Board', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/people')

    await expect.element(screen.getByText('Kanban board')).toBeVisible()
    const tabs = screen.getByRole('navigation', { name: 'Project views' })
    expect(
      tabs
        .getByRole('link')
        .elements()
        .map((tab) => tab.textContent)
    ).toEqual(['Board', 'People', 'Settings'])
    await expect
      .element(tabs.getByRole('link', { name: 'People' }))
      .toHaveAttribute('aria-current', 'page')
    await expect
      .element(rowList(screen).getByRole('button'))
      .toHaveTextContent('0/3 issues')
  })

  it('says an empty kanban board has no issues yet', async () => {
    inProjects({
      'GET /api/projects/OPS/people': {
        status: 200,
        body: { sprint: null, people: [] },
      },
    })
    const { screen } = await renderApp('/p/OPS/people')

    await expect
      .element(screen.getByText('The board has no issues yet.'))
      .toBeVisible()
  })

  it('puts the bar to the right of the name on a desktop, and under it full width on a phone', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/people')
    const row = rowList(screen).getByRole('button').first()
    await expect.element(row).toBeVisible()
    const box = (selector: string) =>
      row.element().querySelector(selector)!.getBoundingClientRect()

    expect(box('[data-slot=bar]').left).toBeGreaterThan(
      box('[data-slot=name]').right
    )

    await page.viewport(375, 800)
    await expect
      .poll(() => box('[data-slot=bar]').top)
      .toBeGreaterThanOrEqual(box('[data-slot=name]').bottom)
    const rowBox = row.element().getBoundingClientRect()
    expect(rowBox.height).toBeGreaterThanOrEqual(44)
    expect(box('[data-slot=bar]').width).toBeGreaterThan(rowBox.width * 0.8)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    await page.viewport(414, 896)
  })
})
