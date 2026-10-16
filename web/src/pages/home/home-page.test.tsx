import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  MY_OPS,
  MY_WEB,
  homeIssue,
  inProjects,
  problem,
  routeOf,
  signedIn,
} from '@/test/stub-api'

const VISIT = 'POST /api/projects/WEB/visit'

const pageOf = (items: unknown[], next_cursor: number | null = null) => ({
  status: 200,
  body: { items, next_cursor },
})

const yesterday = () => {
  const day = new Date()
  day.setDate(day.getDate() - 1)
  day.setHours(12, 0, 0, 0)
  return day.toISOString()
}

const viewOf = (request: Request) =>
  new URL(request.url).searchParams.get('view')

/** Answers `/api/me/issues` per view; views not listed get an empty page. */
const byView = (lists: Partial<Record<string, unknown[]>>) => ({
  status: 200,
  body: (request: Request) => ({
    items: lists[viewOf(request) ?? 'recommended'] ?? [],
    next_cursor: null,
  }),
})

const LOGIN = homeIssue({
  key: 'WEB-1',
  summary: 'Fix the login page',
  issue_type: 'bug',
  assignee_name: 'Bob Stone',
})
const DEPLOY = homeIssue({
  key: 'OPS-4',
  summary: 'Rotate the deploy keys',
  project_key: 'OPS',
  project_name: 'Operations',
  starred: true,
  at: yesterday(),
})
const ARCHIVE = homeIssue({
  key: 'WEB-9',
  summary: 'Archive old builds',
  issue_type: 'task',
  at: '2020-01-02T12:00:00Z',
})

describe('home', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('shows recommended projects as cards and links to every project', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('heading', { name: 'For you', level: 1 }))
      .toBeVisible()
    const cards = screen.getByRole('region', { name: 'Recommended projects' })
    const web = cards.getByRole('link', { name: 'Website' })
    await expect.element(web).toBeVisible()
    await expect
      .element(cards.getByRole('listitem').first())
      .toHaveTextContent(/Software project.*Scrum/)
    await expect
      .element(cards.getByRole('listitem').nth(1))
      .toHaveTextContent('Kanban')
    await expect
      .element(cards.getByRole('listitem').nth(1))
      .toHaveTextContent('2 open issues assigned to you')

    await screen.getByRole('link', { name: 'View all projects' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'Projects', level: 1 }))
      .toBeVisible()
  })

  it('fetches a project when its card is hovered, before the click', async () => {
    const requests = inProjects()
    const { screen } = await renderApp('/')

    await screen
      .getByRole('region', { name: 'Recommended projects' })
      .getByRole('link', { name: 'Website' })
      .hover()

    await expect
      .poll(() => requests.map(routeOf))
      .toContain('GET /api/projects/WEB/members')
  })

  it('lists recommended issues by day with type, key, project, assignee and time', async () => {
    inProjects({
      'GET /api/me/issues': byView({ recommended: [LOGIN, DEPLOY, ARCHIVE] }),
    })
    const { screen } = await renderApp('/')

    const panel = screen.getByRole('tabpanel', { name: 'Recommended' })
    await expect
      .element(panel.getByRole('heading', { name: 'Today' }))
      .toBeVisible()
    await expect
      .element(panel.getByRole('heading', { name: 'Yesterday' }))
      .toBeVisible()
    await expect
      .element(panel.getByRole('heading', { name: 'Older' }))
      .toBeVisible()
    const login = panel.getByRole('listitem').filter({ hasText: 'WEB-1' })
    await expect.element(login).toHaveTextContent('Bug • WEB-1 • Website')
    await expect
      .element(login.getByTitle('Assigned to Bob Stone'))
      .toBeVisible()
    await expect.element(login).toHaveTextContent('now')
    await panel.getByRole('link', { name: 'Fix the login page' }).click()
    await expect
      .element(screen.getByLabelText('Summary'))
      .toHaveValue('Write the release notes')
  })

  it('switches tabs through the URL and counts what is assigned', async () => {
    const requests = inProjects({
      'GET /api/me/issues': byView({ assigned: [DEPLOY] }),
    })
    const { screen, router } = await renderApp('/')

    const assigned = screen.getByRole('tab', { name: 'Assigned to me 3' })
    await expect
      .element(screen.getByRole('tab', { name: 'Recommended' }))
      .toHaveAttribute('aria-selected', 'true')
    await assigned.click()

    await expect.element(assigned).toHaveAttribute('aria-selected', 'true')
    expect(router.state.location.search).toEqual({ tab: 'assigned' })
    await expect
      .element(screen.getByRole('link', { name: 'Rotate the deploy keys' }))
      .toBeVisible()
    expect(
      requests
        .filter((request) => routeOf(request) === 'GET /api/me/issues')
        .map(viewOf)
    ).toContain('assigned')
  })

  it('moves between tabs with the arrow, Home and End keys', async () => {
    inProjects()
    const { screen } = await renderApp('/')
    const tab = (name: string) => screen.getByRole('tab', { name })

    await tab('Recommended').click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(tab('Assigned to me 3')).toHaveFocus()
    await userEvent.keyboard('{End}')
    await expect.element(tab('Viewed')).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(tab('Recommended')).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(tab('Viewed')).toHaveFocus()
    await userEvent.keyboard('{Home}')
    await expect.element(tab('Recommended')).toHaveFocus()
    await userEvent.keyboard('x')
    await expect.element(tab('Recommended')).toHaveFocus()
  })

  it('opens the focused tab with Space', async () => {
    inProjects()
    const { screen, router } = await renderApp('/')

    await screen.getByRole('tab', { name: 'Recommended' }).click()
    await userEvent.keyboard('{End}')
    await userEvent.keyboard(' ')

    await expect
      .element(screen.getByRole('tab', { name: 'Viewed' }))
      .toHaveAttribute('aria-selected', 'true')
    expect(router.state.location.search).toEqual({ tab: 'viewed' })
  })

  it('keeps every tab in view on a 375px phone', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/')

    for (const name of [
      'Recommended',
      'Assigned to me 3',
      'Starred',
      'Worked on',
      'Viewed',
    ])
      await expect
        .element(screen.getByRole('tab', { name }))
        .toBeInViewport({ ratio: 1 })
  })

  it('records an issue view on opening it, not on hovering its row', async () => {
    const VIEW = 'POST /api/projects/WEB/issues/1/view'
    const requests = inProjects({ 'GET /api/me/issues': pageOf([LOGIN]) })
    const { screen } = await renderApp('/')
    const row = screen.getByRole('link', { name: 'Fix the login page' })
    const seen = (route: string) =>
      requests.filter((request) => routeOf(request) === route).length

    await row.hover()
    await expect
      .poll(() => seen('GET /api/projects/WEB/issues/1'))
      .toBeGreaterThan(0)
    expect(seen(VIEW)).toBe(0)
    await row.click()

    await expect.poll(() => seen(VIEW)).toBe(1)
  })

  it('records a project visit on opening the project, not on hovering its card', async () => {
    const requests = inProjects()
    const { screen } = await renderApp('/')
    const card = screen
      .getByRole('region', { name: 'Recommended projects' })
      .getByRole('link', { name: 'Website' })
    const seen = (route: string) =>
      requests.filter((request) => routeOf(request) === route).length

    await card.hover()
    await expect.poll(() => seen('GET /api/projects/WEB')).toBeGreaterThan(0)
    expect(seen(VISIT)).toBe(0)
    await card.click()

    await expect.poll(() => seen(VISIT)).toBe(1)
  })

  it.each([
    [
      'recommended',
      'Recommended',
      'Issues you open, change, star or get assigned show up here.',
    ],
    ['assigned', 'Assigned to me 3', 'Nothing open is assigned to you.'],
    ['starred', 'Starred', 'Star an issue to keep it here.'],
    [
      'worked',
      'Worked on',
      'Issues you create, edit, move or comment on show up here.',
    ],
    ['viewed', 'Viewed', 'Issues you open show up here.'],
  ])('explains an empty %s tab', async (tab, name, empty) => {
    inProjects()
    const { screen } = await renderApp(`/?tab=${tab}`)

    await expect
      .element(screen.getByRole('tab', { name }))
      .toHaveAttribute('aria-selected', 'true')
    await expect.element(screen.getByText(empty)).toBeVisible()
  })

  it('stars and unstars a row at once, and rolls back when the write fails', async () => {
    const requests = inProjects({
      'GET /api/me/issues': byView({ recommended: [LOGIN, DEPLOY] }),
      // Still pending: the optimistic star is all there is to see.
      'POST /api/me/stars': { status: 204, until: new Promise(() => {}) },
      'DELETE /api/me/stars/OPS-4': {
        status: 500,
        body: problem(500, 'Boom.'),
      },
    })
    const { screen } = await renderApp('/')

    const star = screen.getByRole('button', { name: 'Star WEB-1' })
    await expect.element(star).toHaveAttribute('aria-pressed', 'false')
    await star.click()
    await expect.element(star).toHaveAttribute('aria-pressed', 'true')
    const post = requests.find(
      (request) => routeOf(request) === 'POST /api/me/stars'
    )
    expect(await post?.clone().json()).toEqual({ key: 'WEB-1' })

    const starred = screen.getByRole('button', { name: 'Star OPS-4' })
    await expect.element(starred).toHaveAttribute('aria-pressed', 'true')
    await starred.click()
    await expect
      .element(screen.getByText('OPS-4 was not unstarred'))
      .toBeVisible()
    await expect.element(starred).toHaveAttribute('aria-pressed', 'true')
  })

  it('stars a project from its card', async () => {
    const requests = inProjects({
      'POST /api/me/stars': { status: 204, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/')

    const ops = screen.getByRole('button', { name: 'Star Operations' })
    await expect.element(ops).toHaveAttribute('aria-pressed', 'false')
    await ops.click()

    await expect.element(ops).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(() => requests.map(routeOf))
      .toContain('POST /api/me/stars')
  })

  it('opens the board filtered to me from the assigned count, after the name and star', async () => {
    inProjects()
    const { screen, router } = await renderApp('/')
    const cards = screen.getByRole('region', { name: 'Recommended projects' })

    const name = cards.getByRole('link', { name: 'Operations' })
    await expect.element(name).toBeVisible()
    name.element().focus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(cards.getByRole('button', { name: 'Star Operations' }))
      .toHaveFocus()
    await userEvent.keyboard('{Tab}')
    const count = cards.getByRole('link', {
      name: '2 open issues assigned to you',
    })
    await expect.element(count).toHaveFocus()
    await count.click()

    await expect.poll(() => router.state.location.pathname).toBe('/p/OPS/board')
    expect(router.state.location.search).toEqual({ assignee: [1] })
  })

  it('says so in plain text when nothing open is assigned', async () => {
    inProjects({
      'GET /api/me/projects': {
        status: 200,
        body: [{ ...MY_WEB, open_assigned: 0 }],
      },
    })
    const { screen } = await renderApp('/')
    const cards = screen.getByRole('region', { name: 'Recommended projects' })

    await expect
      .element(cards.getByText('No open issues assigned to you'))
      .toBeVisible()
    expect(
      cards.getByRole('link', { name: /assigned to you/ }).elements()
    ).toHaveLength(0)
  })

  it.each([
    [1280, 800],
    [375, 800],
  ])('shows unstarred stars at rest at %ipx', async (width, height) => {
    await page.viewport(width, height)
    inProjects({ 'GET /api/me/issues': pageOf([LOGIN]) })
    const { screen } = await renderApp('/')

    for (const name of ['Star Operations', 'Star WEB-1']) {
      const star = screen.getByRole('button', { name })
      await expect.element(star).toHaveAttribute('aria-pressed', 'false')
      expect(getComputedStyle(star.element()).opacity).toBe('1')
    }
  })

  it('shows each row status, and done rows as done', async () => {
    const SHIPPED = homeIssue({
      key: 'WEB-7',
      summary: 'Ship the beta',
      status_category: 'done',
    })
    const BUILDING = homeIssue({
      key: 'WEB-8',
      summary: 'Build the beta',
      status_category: 'in_progress',
    })
    inProjects({
      'GET /api/me/issues': pageOf([LOGIN, BUILDING, SHIPPED]),
    })
    const { screen } = await renderApp('/')
    const panel = screen.getByRole('tabpanel', { name: 'Recommended' })
    const row = (key: string) =>
      panel.getByRole('listitem').filter({ hasText: key })

    await expect.element(row('WEB-1')).toHaveTextContent('To do')
    await expect.element(row('WEB-8')).toHaveTextContent('In progress')
    await expect.element(row('WEB-7')).toHaveTextContent('Done')
    await expect
      .element(panel.getByRole('link', { name: 'Ship the beta' }))
      .toHaveClass('text-muted-foreground')
    await expect
      .element(panel.getByRole('link', { name: 'Build the beta' }))
      .not.toHaveClass('text-muted-foreground')
  })

  it('moves the row status next to the key on a 375px phone, so the summary keeps the width', async () => {
    await page.viewport(375, 800)
    inProjects({
      'GET /api/me/issues': pageOf([
        homeIssue({
          key: 'WEB-7',
          summary: 'Ship the beta',
          status_category: 'done',
        }),
      ]),
    })
    const { screen } = await renderApp('/')
    const row = screen
      .getByRole('tabpanel', { name: 'Recommended' })
      .getByRole('listitem')

    await expect.element(row.getByText('Done •')).toBeVisible()
    await expect
      .element(row.getByText('Done', { exact: true }))
      .not.toBeVisible()
  })

  it('loads more rows on demand', async () => {
    inProjects({
      'GET /api/me/issues': {
        status: 200,
        body: (request: Request) =>
          new URL(request.url).searchParams.get('cursor')
            ? { items: [ARCHIVE], next_cursor: null }
            : { items: [LOGIN], next_cursor: 50 },
      },
    })
    const { screen } = await renderApp('/')

    await screen.getByRole('button', { name: 'Show more' }).click()

    await expect
      .element(screen.getByRole('link', { name: 'Archive old builds' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Show more' }))
      .not.toBeInTheDocument()
  })

  it('holds the layout with skeletons while the lists load', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => (answer = resolve))
    inProjects({
      'GET /api/me/projects': { status: 200, body: [MY_WEB, MY_OPS], until },
      'GET /api/me/issues': { ...pageOf([LOGIN]), until },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('status', { name: 'Loading projects' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('status', { name: 'Loading issues' }))
      .toBeVisible()
    answer()
    await expect
      .element(screen.getByRole('link', { name: 'Fix the login page' }))
      .toBeVisible()
  })

  it('offers a new project or the sample when there are none', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    await expect
      .element(
        screen.getByText(
          'A project groups a board, its backlog and its sprints.'
        )
      )
      .toBeVisible()
    await expect
      .element(
        screen.getByRole('button', { name: 'Start with a sample project' })
      )
      .toBeVisible()
    await screen
      .getByRole('main')
      .getByRole('link', { name: 'New project' })
      .click()
    await expect
      .element(screen.getByRole('heading', { name: 'New project' }))
      .toBeVisible()
  })

  it('says so when the projects fail to load, and retries', async () => {
    signedIn({
      'GET /api/me/projects': { status: 500, body: problem(500, 'Boom.') },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Your projects did not load.')
    signedIn()
    await screen.getByRole('button', { name: 'Try again' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
  })

  it('says so when a list fails to load, and retries', async () => {
    inProjects({
      'GET /api/me/issues': { status: 500, body: problem(500, 'Boom.') },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('These issues did not load.')
    inProjects({ 'GET /api/me/issues': pageOf([LOGIN]) })
    await screen.getByRole('button', { name: 'Try again' }).click()
    await expect
      .element(screen.getByRole('link', { name: 'Fix the login page' }))
      .toBeVisible()
  })
})
