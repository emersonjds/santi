import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { MyItem, MyProject } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import { MY_OPS, inProjects, problem, routeOf, signedIn } from '@/test/stub-api'

const sidebar = (screen: RenderResult) =>
  screen.getByRole('navigation', { name: 'Projects and pages' })

const item = (
  fields: Partial<MyItem> & Pick<MyItem, 'key' | 'name'>
): MyItem => ({
  kind: 'issue',
  project_key: 'WEB',
  project_name: 'Website',
  board_type: 'scrum',
  issue_type: 'bug',
  at: new Date().toISOString(),
  ...fields,
})

const LOGIN = item({ key: 'WEB-1', name: 'Fix the login page' })
const WEBSITE = item({
  kind: 'project',
  key: 'WEB',
  name: 'Website',
  issue_type: null,
  at: '2020-01-02T12:00:00Z',
})
const DEPLOY = item({
  key: 'OPS-4',
  name: 'Rotate the deploy keys',
  project_key: 'OPS',
  project_name: 'Operations',
  issue_type: 'task',
})

const pageOf = (items: MyItem[], next_cursor: number | null = null) => ({
  items,
  next_cursor,
})

const query = (request: Request, name: string) =>
  new URL(request.url).searchParams.get(name)

/** Answers a feed by its `q`: rows whose name holds it, case-insensitive. */
const searched = (items: MyItem[]) => ({
  status: 200,
  body: (request: Request) => {
    const text = (query(request, 'q') ?? '').toLowerCase()
    return pageOf(items.filter((row) => row.name.toLowerCase().includes(text)))
  },
})

const openFlyout = async (screen: RenderResult, name: 'Recent' | 'Starred') => {
  await sidebar(screen).getByRole('button', { name }).click()
  const dialog = screen.getByRole('dialog', { name })
  await expect.element(dialog).toBeVisible()
  return dialog
}

describe('sidebar entries', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('lists For you, Recent, Starred and Projects, nothing more', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    const nav = sidebar(screen)
    await expect
      .element(nav.getByRole('link', { name: 'For you' }))
      .toBeVisible()
    const labels = [
      ...nav
        .element()
        .querySelectorAll(
          '[data-sidebar=menu-button], [data-sidebar=group-label]'
        ),
    ].map((node) => node.textContent?.trim())
    expect(labels.slice(0, 4)).toEqual([
      'For you',
      'Recent',
      'Starred',
      'Projects',
    ])
    for (const name of ['Filters', 'Dashboards', 'Plans'])
      expect(nav.getByText(name).elements()).toHaveLength(0)
    await expect
      .element(nav.getByRole('button', { name: 'Recent' }))
      .toHaveAttribute('aria-expanded', 'false')
    await expect
      .element(nav.getByRole('button', { name: 'Starred' }))
      .toHaveAttribute('aria-expanded', 'false')
  })
})

describe('recent flyout', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('groups what was opened by day and links to it', async () => {
    const requests = inProjects({
      'GET /api/me/recent': { status: 200, body: pageOf([LOGIN, WEBSITE]) },
    })
    const { screen, router } = await renderApp('/')

    const trigger = sidebar(screen).getByRole('button', { name: 'Recent' })
    await expect.element(trigger).toBeVisible()
    const button = trigger.element()
    const dialog = await openFlyout(screen, 'Recent')
    // The modal flyout hides the sidebar from the accessibility tree.
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const today = dialog.getByRole('region', { name: 'Today' })
    await expect.element(today).toHaveTextContent(/Fix the login page/)
    await expect.element(today).toHaveTextContent(/Bug • WEB-1 • Website/)
    await expect
      .element(dialog.getByRole('region', { name: 'Older' }))
      .toHaveTextContent(/Website.*Scrum project/)
    expect(
      requests.find((request) => routeOf(request) === 'GET /api/me/recent')?.url
    ).toContain('limit=15')

    await dialog.getByRole('link', { name: /Fix the login page/ }).click()

    await expect.element(dialog).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/p/WEB/issues/1')
  })

  it('closes on Esc, gives focus back and starts the next search empty', async () => {
    inProjects({ 'GET /api/me/recent': searched([LOGIN, DEPLOY]) })
    const { screen } = await renderApp('/')

    let dialog = await openFlyout(screen, 'Recent')
    const search = dialog.getByRole('searchbox', { name: 'Search recent' })
    await expect.element(search).toHaveFocus()
    await search.fill('deploy')
    await expect
      .element(dialog.getByText('Fix the login page'))
      .not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(sidebar(screen).getByRole('button', { name: 'Recent' }))
      .toHaveFocus()
    dialog = await openFlyout(screen, 'Recent')
    await expect
      .element(dialog.getByRole('searchbox', { name: 'Search recent' }))
      .toHaveValue('')
    await expect.element(dialog.getByText('Fix the login page')).toBeVisible()
  })

  it('searches the server, clears and says when nothing matches', async () => {
    const requests = inProjects({
      'GET /api/me/recent': searched([LOGIN, DEPLOY]),
    })
    const { screen } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Recent')
    expect(
      dialog.getByRole('button', { name: 'Clear search' }).elements()
    ).toHaveLength(0)
    await dialog.getByRole('searchbox').fill('LOGIN')

    await expect
      .element(dialog.getByText('Rotate the deploy keys'))
      .not.toBeInTheDocument()
    await expect.element(dialog.getByText('Fix the login page')).toBeVisible()
    expect(requests.some((request) => query(request, 'q') === 'LOGIN')).toBe(
      true
    )

    await dialog.getByRole('searchbox').fill('zebra')
    await expect
      .element(dialog.getByRole('heading', { name: 'No matches' }))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('link', { name: /See everything/ }))
      .toHaveAttribute('href', '/?tab=viewed')

    await dialog.getByRole('button', { name: 'Clear search' }).click()
    await expect.element(dialog.getByRole('searchbox')).toHaveValue('')
    await expect.element(dialog.getByRole('searchbox')).toHaveFocus()
    await expect
      .element(dialog.getByText('Rotate the deploy keys'))
      .toBeVisible()
  })

  it('says nothing was viewed yet and keeps the way to For you', async () => {
    inProjects({ 'GET /api/me/recent': { status: 200, body: pageOf([]) } })
    const { screen } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Recent')

    await expect
      .element(dialog.getByRole('heading', { name: 'Nothing viewed yet' }))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('link', { name: /See everything/ }))
      .toHaveAttribute('href', '/?tab=viewed')
  })

  it('offers a retry when the list fails', async () => {
    let fail = true
    inProjects({
      'GET /api/me/recent': {
        status: 200,
        body: () => {
          if (fail) throw new Error('down')
          return pageOf([LOGIN])
        },
      },
    })
    const { screen } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Recent')
    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent(/Recent items did not load/)
    fail = false
    await dialog.getByRole('button', { name: 'Retry' }).click()

    await expect.element(dialog.getByText('Fix the login page')).toBeVisible()
    await expect.element(dialog).toBeVisible()
  })

  it('loads 15 more when the list scrolls to its end', async () => {
    await page.viewport(1280, 500)
    const first = Array.from({ length: 15 }, (_, index) =>
      item({ key: `WEB-${index + 10}`, name: `Old issue ${index + 10}` })
    )
    const requests = inProjects({
      'GET /api/me/recent': {
        status: 200,
        body: (request: Request) =>
          query(request, 'cursor') === '15'
            ? pageOf([
                first[14],
                item({ key: 'WEB-99', name: 'The very last one' }),
              ])
            : pageOf(first, 15),
      },
    })
    const { screen } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Recent')
    await expect.element(dialog.getByText('Old issue 24')).toBeInTheDocument()
    dialog.getByText('Old issue 24').element().scrollIntoView()

    await expect
      .element(dialog.getByText('The very last one'))
      .toBeInTheDocument()
    expect(
      requests.filter((request) => query(request, 'cursor') === '15')
    ).toHaveLength(1)
    // Offset paging repeats a row that moved between the two requests.
    expect(dialog.getByText('Old issue 24').elements()).toHaveLength(1)
  })

  it('stops loading more after a failed page and offers a retry', async () => {
    await page.viewport(1280, 500)
    const first = Array.from({ length: 15 }, (_, index) =>
      item({ key: `WEB-${index + 10}`, name: `Old issue ${index + 10}` })
    )
    let fail = true
    const requests = inProjects({
      'GET /api/me/recent': {
        status: 200,
        body: (request: Request) => {
          if (query(request, 'cursor') !== '15') return pageOf(first, 15)
          if (fail) throw new Error('down')
          return pageOf([item({ key: 'WEB-99', name: 'The very last one' })])
        },
      },
    })
    const { screen } = await renderApp('/')
    const nextPages = () =>
      requests.filter((request) => query(request, 'cursor') === '15')

    const dialog = await openFlyout(screen, 'Recent')
    await expect.element(dialog.getByText('Old issue 24')).toBeInTheDocument()
    dialog.getByText('Old issue 24').element().scrollIntoView()

    const retry = dialog.getByRole('button', { name: 'Retry' })
    await expect.element(retry).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(nextPages()).toHaveLength(1)

    fail = false
    await retry.click()
    await expect
      .element(dialog.getByText('The very last one'))
      .toBeInTheDocument()
    expect(nextPages()).toHaveLength(2)
  })

  it('opens beside the sidebar and closes when Starred opens', async () => {
    inProjects({
      'GET /api/me/recent': { status: 200, body: pageOf([LOGIN]) },
      'GET /api/me/starred': { status: 200, body: pageOf([DEPLOY]) },
    })
    const { screen } = await renderApp('/')

    const nav = sidebar(screen)
    await expect.element(nav).toBeVisible()
    const starred = nav.getByRole('button', { name: 'Starred' }).element()
    const bar = nav.element().getBoundingClientRect()
    const recent = await openFlyout(screen, 'Recent')
    expect(
      recent.element().getBoundingClientRect().left
    ).toBeGreaterThanOrEqual(bar.right - 1)
    await userEvent.click(starred)

    const next = screen.getByRole('dialog', { name: 'Starred' })
    await expect.element(next).toBeVisible()
    await expect.element(recent).not.toBeInTheDocument()
    const search = next.getByRole('searchbox', { name: 'Search starred' })
    await expect.element(search).toHaveFocus()
    // The closing flyout gives the focus back after a tick; it must not take it from the new one.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(document.activeElement).toBe(search.element())
  })

  it('fills a phone screen with 44px rows and no sideways scroll', async () => {
    await page.viewport(375, 800)
    inProjects({ 'GET /api/me/recent': { status: 200, body: pageOf([LOGIN]) } })
    const { screen } = await renderApp('/')

    await screen.getByRole('button', { name: 'Toggle Sidebar' }).click()
    await screen.getByRole('button', { name: 'Recent' }).click()
    const dialog = screen.getByRole('dialog', { name: 'Recent' })
    await expect.element(dialog).toBeVisible()

    expect(dialog.element().getBoundingClientRect().width).toBe(375)
    const row = dialog.getByRole('link', { name: /Fix the login page/ })
    await expect.element(row).toBeVisible()
    expect(row.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44
    )
    expect(
      dialog
        .getByRole('button', { name: 'Close' })
        .element()
        .getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(44)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    expect(
      getComputedStyle(dialog.getByRole('searchbox').element()).fontSize
    ).toBe('16px')
  })
})

describe('starred flyout', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('filters by type and keeps an unstarred row until it closes', async () => {
    let starred = [LOGIN, WEBSITE]
    const requests = inProjects({
      'GET /api/me/starred': {
        status: 200,
        body: (request: Request) => {
          const kind = query(request, 'kind')
          return pageOf(starred.filter((row) => !kind || row.kind === kind))
        },
      },
      'DELETE /api/me/stars/WEB-1': { status: 204 },
    })
    const { screen } = await renderApp('/')

    let dialog = await openFlyout(screen, 'Starred')
    await expect
      .element(dialog.getByText('Website', { exact: true }))
      .toBeVisible()
    await dialog.getByRole('button', { name: /Type/ }).click()
    await screen.getByRole('menuitemradio', { name: 'Issues' }).click()

    await expect
      .element(dialog.getByText('Website', { exact: true }))
      .not.toBeInTheDocument()
    expect(requests.some((request) => query(request, 'kind') === 'issue')).toBe(
      true
    )
    const toggle = dialog.getByRole('button', { name: 'Star WEB-1' })
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true')
    starred = [WEBSITE]
    await toggle.click()

    await expect.element(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect.element(dialog.getByText('Fix the login page')).toBeVisible()
    expect(
      requests.some(
        (request) => routeOf(request) === 'DELETE /api/me/stars/WEB-1'
      )
    ).toBe(true)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(sidebar(screen).getByRole('button', { name: 'Starred' }))
      .toHaveFocus()
    dialog = await openFlyout(screen, 'Starred')
    await expect
      .element(dialog.getByText('Website', { exact: true }))
      .toBeVisible()
    expect(dialog.getByText('Fix the login page').elements()).toHaveLength(0)
    await expect
      .element(dialog.getByRole('link', { name: /See everything/ }))
      .toHaveAttribute('href', '/?tab=starred')
  })

  it('flips the star back when the write fails', async () => {
    inProjects({
      'GET /api/me/starred': { status: 200, body: pageOf([LOGIN]) },
      'DELETE /api/me/stars/WEB-1': { status: 500, body: problem(500, 'down') },
    })
    const { screen } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Starred')
    const toggle = dialog.getByRole('button', { name: 'Star WEB-1' })
    await toggle.click()

    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('stars a project from the flyout', async () => {
    const requests = inProjects({
      'GET /api/me/starred': { status: 200, body: pageOf([WEBSITE]) },
      'DELETE /api/me/stars/WEB': { status: 204 },
      'POST /api/me/stars': { status: 204 },
    })
    const { screen } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Starred')
    const toggle = dialog.getByRole('button', { name: 'Star Website' })
    await toggle.click()
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()

    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(
      requests.some((request) => routeOf(request) === 'POST /api/me/stars')
    ).toBe(true)
  })

  it('explains how to star when nothing is starred, without a search box', async () => {
    inProjects({ 'GET /api/me/starred': { status: 200, body: pageOf([]) } })
    const { screen } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Starred')

    await expect
      .element(dialog.getByRole('heading', { name: 'Nothing starred yet' }))
      .toBeVisible()
    expect(dialog.getByRole('searchbox').elements()).toHaveLength(0)
    await expect
      .element(dialog.getByRole('link', { name: /See everything/ }))
      .toHaveAttribute('href', '/?tab=starred')
  })

  it('says when a search finds no starred item', async () => {
    inProjects({ 'GET /api/me/starred': searched([LOGIN]) })
    const { screen } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Starred')
    await dialog
      .getByRole('searchbox', { name: 'Search starred' })
      .fill('zebra')

    await expect
      .element(dialog.getByRole('heading', { name: 'No matches' }))
      .toBeVisible()
  })

  it('keeps the rows it had when a retry fails again', async () => {
    let fail = false
    inProjects({
      'GET /api/me/starred': {
        status: 200,
        body: () => {
          if (fail) throw new Error('down')
          return pageOf([LOGIN])
        },
      },
    })
    const { screen, queryClient } = await renderApp('/')

    const dialog = await openFlyout(screen, 'Starred')
    await expect.element(dialog.getByText('Fix the login page')).toBeVisible()
    fail = true
    await queryClient.refetchQueries({ queryKey: ['home', 'starred'] })

    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent(/Starred items did not load/)
    await dialog.getByRole('button', { name: 'Retry' }).click()
    await expect.element(dialog.getByText('Fix the login page')).toBeVisible()
  })
})

const project = (name: string, fields: Partial<MyProject> = {}): MyProject => ({
  ...MY_OPS,
  key: name.slice(0, 3).toUpperCase(),
  name,
  starred: false,
  ...fields,
})

const visited = (name: string) =>
  project(name, { visited_at: '2026-10-16T10:00:00Z' })

// The sidebar keeps the first five; Fig is recent but left out, the rest were never visited.
const MANY = [
  visited('Apple'),
  visited('Berry'),
  visited('Cherry'),
  visited('Date'),
  visited('Elder'),
  visited('Fig'),
  project('zeta'),
  project('Grape'),
  project('alpha'),
]

const openMore = async (screen: RenderResult) => {
  await sidebar(screen).getByRole('button', { name: 'More projects' }).click()
  const dialog = screen.getByRole('dialog', { name: 'More projects' })
  await expect.element(dialog).toBeVisible()
  return dialog
}

const names = (region: ReturnType<RenderResult['getByRole']>) =>
  region
    .getByRole('link')
    .elements()
    .map((link) => link.getAttribute('title'))

describe('more projects flyout', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('lists what the sidebar leaves out: recent first, then the rest by name', async () => {
    const requests = signedIn({
      'GET /api/me/projects': { status: 200, body: MANY },
    })
    const { screen } = await renderApp('/')

    const trigger = sidebar(screen).getByRole('button', {
      name: 'More projects',
    })
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    const before = requests.length
    const dialog = await openMore(screen)

    expect(names(dialog.getByRole('region', { name: 'Recent' }))).toEqual([
      'Fig',
    ])
    expect(names(dialog.getByRole('region', { name: 'Other' }))).toEqual([
      'alpha',
      'Grape',
      'zeta',
    ])
    await expect
      .element(dialog.getByRole('link', { name: /Grape/ }))
      .toHaveAttribute('href', '/p/GRA')
    await expect
      .element(dialog.getByRole('link', { name: 'See all projects' }))
      .toHaveAttribute('href', '/projects')
    expect(requests.slice(before).map(routeOf)).not.toContain(
      'GET /api/me/projects'
    )
  })

  it('searches the cached list by name or key', async () => {
    signedIn({ 'GET /api/me/projects': { status: 200, body: MANY } })
    const { screen } = await renderApp('/')

    const dialog = await openMore(screen)
    const search = dialog.getByRole('searchbox', { name: 'Search projects' })
    await expect.element(search).toHaveFocus()
    await search.fill('ZET')
    await expect
      .element(dialog.getByRole('link', { name: /Fig/ }))
      .not.toBeInTheDocument()
    expect(names(dialog.getByRole('region', { name: 'Other' }))).toEqual([
      'zeta',
    ])

    await search.fill('apple')
    await expect
      .element(dialog.getByRole('heading', { name: 'No matches' }))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('link', { name: 'See all projects' }))
      .toBeVisible()
  })

  it('says when every project is already in the sidebar', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    const dialog = await openMore(screen)

    await expect
      .element(
        dialog.getByRole('heading', {
          name: 'All your projects are in the sidebar',
        })
      )
      .toBeVisible()
    expect(dialog.getByRole('searchbox').elements()).toHaveLength(0)
  })

  it('closes on a project link and on Esc, giving focus back', async () => {
    signedIn({ 'GET /api/me/projects': { status: 200, body: MANY } })
    const { screen, router } = await renderApp('/')

    let dialog = await openMore(screen)
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(sidebar(screen).getByRole('button', { name: 'More projects' }))
      .toHaveFocus()

    dialog = await openMore(screen)
    await dialog.getByRole('link', { name: 'See all projects' }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/projects')
  })
})
