import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { MyProject } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  MY_OPS,
  MY_WEB,
  inProjects,
  problem,
  routeOf,
  signedIn,
} from '@/test/stub-api'

const sidebar = (screen: RenderResult) =>
  screen.getByRole('navigation', { name: 'Projects and pages' })

type Locator = ReturnType<RenderResult['getByRole']>

const pageNames = (nav: Locator, key: string) =>
  [...nav.element().querySelectorAll(`#sidebar-pages-${key} a`)].map(
    (link) => link.textContent
  )

describe('app shell', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('expands the current project in the sidebar and marks the open page', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')

    const nav = sidebar(screen)
    await expect
      .element(nav.getByRole('link', { name: 'Backlog' }))
      .toHaveAttribute('aria-current', 'page')
    expect(pageNames(nav, 'WEB')).toEqual([
      'Board',
      'Backlog',
      'Reports',
      'Settings',
    ])
    await expect
      .element(nav.getByRole('link', { name: 'Reports' }))
      .toHaveAttribute('href', '/p/WEB/reports')
    await expect
      .element(nav.getByRole('link', { name: 'Board' }))
      .not.toHaveAttribute('aria-current')
    await expect
      .element(nav.getByRole('link', { name: /Operations/ }))
      .toBeVisible()
  })

  it('keeps the top bar above backlog rows that scroll under it', async () => {
    await page.viewport(1280, 150)
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')
    const header = screen.getByRole('banner')
    await expect.element(header).toBeVisible()
    const row = screen
      .getByRole('region', { name: 'Backlog' })
      .getByRole('listitem')
      .first()
    await expect.element(row).toBeVisible()

    const bar = header.element().getBoundingClientRect()
    window.scrollBy(0, row.element().getBoundingClientRect().top - bar.top - 4)
    expect(row.element().getBoundingClientRect().top).toBeLessThan(bar.bottom)
    const controls = [...row.element().querySelectorAll('button')]
    const control = controls.at(-1)
    if (!control) throw new Error('row has no buttons')
    const box = control.getBoundingClientRect()
    window.scrollBy(0, box.top - bar.top - 8)
    const moved = control.getBoundingClientRect()
    expect(moved.top).toBeLessThan(bar.bottom)
    const hit = document.elementFromPoint(
      moved.left + moved.width / 2,
      moved.top + moved.height / 2
    )

    expect(header.element().contains(hit)).toBe(true)
  })

  it('shows only the board for a kanban project', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/board')

    const nav = sidebar(screen)
    await expect
      .element(nav.getByRole('link', { name: 'Board' }))
      .toHaveAttribute('aria-current', 'page')
    expect(pageNames(nav, 'OPS')).toEqual(['Board', 'Settings'])
  })

  it('marks For you as the open page on home', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    await expect
      .element(sidebar(screen).getByRole('link', { name: 'For you' }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('sends + Create to a new project while there are none', async () => {
    signedIn()
    const { screen, router } = await renderApp('/')

    await screen.getByRole('link', { name: 'Create', exact: true }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'New project' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/projects/new')
  })

  it('searches the current project from the top bar', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    await screen.getByRole('searchbox', { name: 'Search WEB' }).fill('login')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(screen.getByRole('heading', { name: 'Search' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/search')
    expect(router.state.location.search).toEqual({ q: 'login' })
  })

  it('hides the project search outside a project', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    expect(screen.getByRole('searchbox').elements()).toHaveLength(0)
  })

  it('jumps to a project from the command menu', async () => {
    inProjects()
    const { screen, router } = await renderApp('/')
    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .toBeVisible()

    await userEvent.keyboard('{Meta>}k{/Meta}')
    await expect
      .element(screen.getByRole('option', { name: /New project/ }))
      .toBeVisible()
    await screen.getByRole('option', { name: /Operations/ }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Operations' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/OPS/board')
  })

  it('starts a new project from the command menu, opened with Ctrl+K', async () => {
    inProjects()
    const { screen, router } = await renderApp('/')
    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .toBeVisible()

    await userEvent.keyboard('k')
    expect(screen.getByRole('dialog').elements()).toHaveLength(0)
    await userEvent.keyboard('{Control>}k{/Control}')
    await screen.getByRole('option', { name: 'New project' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'New project' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/projects/new')
  })

  it('opens the command menu from the top bar', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    await screen.getByRole('button', { name: /Jump to a project/ }).click()

    await expect
      .element(screen.getByRole('option', { name: /Website/ }))
      .toBeVisible()
  })

  it('opens the sidebar as a drawer on a phone and closes it on navigation', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen, router } = await renderApp('/')

    await screen.getByRole('button', { name: 'Toggle Sidebar' }).click()
    const drawer = screen.getByRole('dialog')
    await drawer.getByRole('link', { name: /Website/ }).click()

    await expect.element(drawer).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/p/WEB/board')
  })
})

const LAST_ADMIN =
  'You are the last admin: make another member admin first, or delete the project.'

const VIEW_KEY = 'sidebar-projects-view'

const mine = (name: string, fields: Partial<MyProject> = {}): MyProject => ({
  ...MY_OPS,
  key: name.slice(0, 3).toUpperCase(),
  name,
  starred: false,
  ...fields,
})

// The /api/me/projects order: the most recent visit first.
const MANY = [
  mine('Apple'),
  mine('Kiwi', { starred: true, starred_at: '2026-10-01T10:00:00Z' }),
  mine('Berry'),
  mine('Cherry'),
  mine('Lime', { starred: true, starred_at: '2026-10-02T10:00:00Z' }),
  mine('Date'),
  mine('Elder'),
  mine('Fig'),
]

const rows = (list: Locator) =>
  list
    .getByRole('button', { name: /^Toggle / })
    .elements()
    .map((button) => button.getAttribute('aria-label')?.slice(7))

const sublist = (screen: RenderResult, name: 'Starred' | 'Recent') =>
  sidebar(screen).getByRole('list', { name })

const pending = new Promise(() => {})

const openActions = async (screen: RenderResult, name: string) => {
  await sidebar(screen)
    .getByRole('button', { name: `Actions for ${name}` })
    .click()
  return screen.getByRole('menu')
}

const itemNames = (menu: Locator) =>
  menu
    .getByRole('menuitem')
    .elements()
    .map((item) => item.textContent)

describe('sidebar projects', () => {
  beforeEach(() => page.viewport(1280, 800))
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('lists starred projects above five recent ones, each once', async () => {
    signedIn({ 'GET /api/me/projects': { status: 200, body: MANY } })
    const { screen } = await renderApp('/')

    await expect.element(sublist(screen, 'Starred')).toBeVisible()
    expect(rows(sublist(screen, 'Starred'))).toEqual(['Lime', 'Kiwi'])
    expect(rows(sublist(screen, 'Recent'))).toEqual([
      'Apple',
      'Berry',
      'Cherry',
      'Date',
      'Elder',
    ])
  })

  it('moves a project to starred at once and refills recent to five', async () => {
    signedIn({
      'GET /api/me/projects': { status: 200, body: MANY },
      'POST /api/me/stars': { status: 204, until: pending },
    })
    const { screen } = await renderApp('/')

    const star = sidebar(screen).getByRole('button', { name: 'Star Berry' })
    await expect.element(star).toHaveAttribute('aria-pressed', 'false')
    await star.click()

    await expect
      .poll(() => rows(sublist(screen, 'Starred')))
      .toEqual(['Berry', 'Lime', 'Kiwi'])
    expect(rows(sublist(screen, 'Recent'))).toEqual([
      'Apple',
      'Cherry',
      'Date',
      'Elder',
      'Fig',
    ])
  })

  it('returns an unstarred project to recent at once', async () => {
    signedIn({
      'GET /api/me/projects': { status: 200, body: MANY },
      'DELETE /api/me/stars/LIM': { status: 204, until: pending },
    })
    const { screen } = await renderApp('/')

    await sidebar(screen).getByRole('button', { name: 'Star Lime' }).click()

    await expect
      .poll(() => rows(sublist(screen, 'Recent')))
      .toEqual(['Apple', 'Berry', 'Cherry', 'Lime', 'Date'])
    expect(rows(sublist(screen, 'Starred'))).toEqual(['Kiwi'])
  })

  it('keeps the focus on the star of a row that moves', async () => {
    signedIn({
      'GET /api/me/projects': { status: 200, body: MANY },
      'POST /api/me/stars': { status: 204, until: pending },
      'DELETE /api/me/stars/LIM': { status: 204, until: pending },
    })
    const { screen } = await renderApp('/')
    const star = (name: string) =>
      sidebar(screen).getByRole('button', { name: `Star ${name}` })

    await star('Berry').click()
    await expect
      .poll(() => rows(sublist(screen, 'Starred')))
      .toEqual(['Berry', 'Lime', 'Kiwi'])
    await expect
      .poll(() => document.activeElement)
      .toBe(star('Berry').element())

    await star('Lime').click()
    await expect
      .poll(() => rows(sublist(screen, 'Starred')))
      .toEqual(['Berry', 'Kiwi'])
    await expect.poll(() => document.activeElement).toBe(star('Lime').element())
  })

  it('puts a star back and says so when the write fails', async () => {
    signedIn({
      'GET /api/me/projects': { status: 200, body: MANY },
      'POST /api/me/stars': { status: 500, body: problem(500, 'down') },
      'DELETE /api/me/stars/LIM': { status: 500, body: problem(500, 'down') },
    })
    const { screen } = await renderApp('/')
    const star = (name: string) =>
      sidebar(screen).getByRole('button', { name: `Star ${name}` })

    await star('Berry').click()
    await expect.element(screen.getByText('BER was not starred')).toBeVisible()
    await expect
      .poll(() => rows(sublist(screen, 'Starred')))
      .toEqual(['Lime', 'Kiwi'])
    await expect.element(star('Berry')).toHaveAttribute('aria-pressed', 'false')

    await star('Lime').click()
    await expect
      .element(screen.getByText('LIM was not unstarred'))
      .toBeVisible()
    await expect
      .poll(() => rows(sublist(screen, 'Starred')))
      .toEqual(['Lime', 'Kiwi'])
    await expect.element(star('Lime')).toHaveAttribute('aria-pressed', 'true')
  })

  it('changes the view from the header menu and keeps it after a reload', async () => {
    signedIn({ 'GET /api/me/projects': { status: 200, body: MANY } })
    const { screen } = await renderApp('/')

    await sidebar(screen)
      .getByRole('button', { name: 'Projects options' })
      .click()
    await screen.getByRole('menuitem', { name: 'View' }).click()
    await screen.getByRole('menuitemradio', { name: 'Starred only' }).click()

    await expect.element(sublist(screen, 'Recent')).not.toBeInTheDocument()
    // The closing menu keeps the sidebar hidden from the accessibility tree for a moment.
    await expect
      .poll(() => rows(sublist(screen, 'Starred')))
      .toEqual(['Lime', 'Kiwi'])
    expect(localStorage.getItem(VIEW_KEY)).toBe('starred')

    // A second app in the same page, as after a reload.
    const again = sidebar((await renderApp('/')).screen).last()
    await expect
      .element(again.getByRole('list', { name: 'Starred' }))
      .toBeVisible()
    expect(again.getByRole('list', { name: 'Recent' }).elements()).toEqual([])

    localStorage.setItem(VIEW_KEY, 'latest')
    const latest = sidebar((await renderApp('/')).screen).last()
    await expect
      .element(latest.getByRole('list', { name: 'Recent' }))
      .toBeVisible()
    expect(rows(latest.getByRole('list', { name: 'Recent' }))).toEqual([
      'Apple',
    ])
    expect(latest.getByRole('list', { name: 'Starred' }).elements()).toEqual([])
  })

  it('falls back to recent and starred when the stored view is unreadable', async () => {
    localStorage.setItem(VIEW_KEY, 'everything')
    signedIn({ 'GET /api/me/projects': { status: 200, body: MANY } })
    const { screen } = await renderApp('/')

    await expect.element(sublist(screen, 'Recent')).toBeVisible()
    await expect.element(sublist(screen, 'Starred')).toBeVisible()
  })

  it('keeps a chosen view until the reload when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    signedIn({ 'GET /api/me/projects': { status: 200, body: MANY } })
    const { screen } = await renderApp('/')

    await expect.element(sublist(screen, 'Recent')).toBeVisible()
    await sidebar(screen)
      .getByRole('button', { name: 'Projects options' })
      .click()
    await screen.getByRole('menuitem', { name: 'View' }).click()
    await screen
      .getByRole('menuitemradio', { name: 'Most recent project' })
      .click()

    await expect.element(sublist(screen, 'Starred')).not.toBeInTheDocument()
    await expect.poll(() => rows(sublist(screen, 'Recent'))).toEqual(['Apple'])
  })

  it('links the header menu to the project directory', async () => {
    inProjects()
    const { screen, router } = await renderApp('/')

    await sidebar(screen)
      .getByRole('button', { name: 'Projects options' })
      .click()
    await screen.getByRole('menuitem', { name: 'Manage projects' }).click()

    await expect.poll(() => router.state.location.pathname).toBe('/projects')
  })

  it('shows three placeholder rows while loading, the header still working', async () => {
    signedIn({ 'GET /api/me/projects': { status: 200, until: pending } })
    const { screen, router } = await renderApp('/projects/new')

    const nav = sidebar(screen)
    await expect
      .element(nav.getByRole('link', { name: 'New project' }))
      .toBeVisible()
    expect(
      nav.element().querySelectorAll('[data-sidebar=menu-skeleton]')
    ).toHaveLength(3)
    await nav.getByRole('button', { name: 'Projects options' }).click()
    await screen.getByRole('menuitem', { name: 'Manage projects' }).click()
    await expect.poll(() => router.state.location.pathname).toBe('/projects')
  })

  it('offers to create a project while there is none', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    const nav = sidebar(screen)
    await expect.element(nav.getByText('No projects yet')).toBeVisible()
    await expect
      .element(nav.getByRole('link', { name: 'Create project' }))
      .toHaveAttribute('href', '/projects/new')
    expect(
      nav.getByRole('button', { name: /^Toggle / }).elements()
    ).toHaveLength(0)
    expect(
      nav.getByRole('button', { name: 'More projects' }).elements()
    ).toHaveLength(0)
  })

  it('says when projects did not load and keeps the rows it had', async () => {
    let fail = true
    signedIn({
      'GET /api/me/projects': {
        status: 200,
        body: () => {
          if (fail) throw new Error('down')
          return [MY_WEB, MY_OPS]
        },
      },
    })
    const { screen, queryClient } = await renderApp('/projects/new')

    const nav = sidebar(screen)
    await expect
      .element(nav.getByRole('alert'))
      .toHaveTextContent('Projects did not load.')
    fail = false
    await nav.getByRole('button', { name: 'Retry' }).click()
    await expect
      .element(nav.getByRole('button', { name: 'Toggle Website' }))
      .toBeVisible()
    await expect.element(nav.getByRole('alert')).not.toBeInTheDocument()

    fail = true
    await queryClient.refetchQueries({ queryKey: ['home', 'projects'] })
    await expect.element(nav.getByRole('alert')).toBeVisible()
    await expect
      .element(nav.getByRole('button', { name: 'Toggle Website' }))
      .toBeVisible()
  })

  it('gives a long name in full to the title', async () => {
    const name = 'A project name far too long to fit in the sidebar width'
    signedIn({ 'GET /api/me/projects': { status: 200, body: [mine(name)] } })
    const { screen } = await renderApp('/')

    await expect
      .element(sidebar(screen).getByRole('link', { name: new RegExp(name) }))
      .toHaveAttribute('title', name)
  })

  it('refreshes the rows after a project visit', async () => {
    const requests = inProjects()
    const { screen, router } = await renderApp('/')
    await expect
      .element(sidebar(screen).getByRole('button', { name: 'Toggle Website' }))
      .toBeVisible()

    await router.navigate({ to: '/p/$key/board', params: { key: 'OPS' } })

    await expect
      .poll(() => {
        const routes = requests.map(routeOf)
        return routes
          .slice(routes.indexOf('POST /api/projects/OPS/visit'))
          .includes('GET /api/me/projects')
      })
      .toBe(true)
  })
})

describe('sidebar project row', () => {
  beforeEach(() => page.viewport(1280, 800))
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('opens the current project, and a row opened by hand closes on reload', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const nav = sidebar(screen)

    await expect
      .element(nav.getByRole('button', { name: 'Toggle Website' }))
      .toHaveAttribute('aria-expanded', 'true')
    const ops = nav.getByRole('button', { name: 'Toggle Operations' })
    await expect.element(ops).toHaveAttribute('aria-expanded', 'false')
    expect(nav.getByRole('link', { name: 'Board' }).elements()).toHaveLength(1)

    await ops.click()
    await expect.element(ops).toHaveAttribute('aria-expanded', 'true')
    await expect
      .element(nav.getByRole('link', { name: 'Board' }).nth(1))
      .toHaveAttribute('href', '/p/OPS/board')
    expect(
      Object.keys(localStorage).filter((key) =>
        key.startsWith('sidebar-expanded:')
      )
    ).toEqual([])

    const again = sidebar((await renderApp('/p/WEB/board')).screen).last()
    await expect
      .element(again.getByRole('button', { name: 'Toggle Website' }))
      .toHaveAttribute('aria-expanded', 'true')
    await expect
      .element(again.getByRole('button', { name: 'Toggle Operations' }))
      .toHaveAttribute('aria-expanded', 'false')
  })

  it('collapses the current project', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const nav = sidebar(screen)

    const web = nav.getByRole('button', { name: 'Toggle Website' })
    await expect.element(web).toHaveAttribute('aria-expanded', 'true')
    await web.click()
    await expect.element(web).toHaveAttribute('aria-expanded', 'false')
    expect(nav.getByRole('link', { name: 'Board' }).elements()).toHaveLength(0)
  })

  it('tabs from the chevron to the name to the star to the actions', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const nav = sidebar(screen)

    const chevron = nav.getByRole('button', { name: 'Toggle Website' })
    await expect
      .element(nav.getByRole('button', { name: 'Actions for Website' }))
      .toBeEnabled()
    chevron.element().focus()
    await expect.element(chevron).toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(nav.getByRole('link', { name: /Website/ }))
      .toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(nav.getByRole('button', { name: 'Star Website' }))
      .toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(nav.getByRole('button', { name: 'Actions for Website' }))
      .toHaveFocus()
  })

  it('gives an admin star, add people, archive and delete, and keeps the last admin from leaving', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    const menu = await openActions(screen, 'Website')
    expect(itemNames(menu)).toEqual([
      'Unstar project',
      'Copy link',
      'Add people',
      'Settings',
      'Archive project',
      'Delete project',
      'Leave project',
    ])
    await expect.element(menu.getByText('Scrum project')).toBeVisible()
    const leave = menu.getByRole('menuitem', { name: 'Leave project' })
    await expect.element(leave).toHaveAttribute('aria-disabled', 'true')
    await expect.element(leave).toHaveAccessibleDescription(LAST_ADMIN)
  })

  it('gives a member star, copy link, settings and leave', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    const menu = await openActions(screen, 'Operations')
    await expect
      .element(menu.getByRole('menuitem', { name: 'Leave project' }))
      .toBeEnabled()
    expect(itemNames(menu)).toEqual([
      'Star project',
      'Copy link',
      'Settings',
      'Leave project',
    ])
    await expect.element(menu.getByText('Kanban project')).toBeVisible()
  })

  it('stars a project from the menu', async () => {
    inProjects({ 'POST /api/me/stars': { status: 204, until: pending } })
    const { screen } = await renderApp('/')

    const menu = await openActions(screen, 'Operations')
    await menu.getByRole('menuitem', { name: 'Star project' }).click()

    await expect
      .poll(() => rows(sublist(screen, 'Starred')))
      .toEqual(['Operations', 'Website'])
    await expect
      .poll(() => document.activeElement)
      .toBe(
        sidebar(screen)
          .getByRole('button', { name: 'Star Operations' })
          .element()
      )
  })

  it('sends an admin to the members page to add people', async () => {
    inProjects()
    const { screen, router } = await renderApp('/')

    const menu = await openActions(screen, 'Website')
    await menu.getByRole('menuitem', { name: 'Add people' }).click()

    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/WEB/settings/members')
  })

  it('copies the project link', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    inProjects()
    const { screen } = await renderApp('/')

    const menu = await openActions(screen, 'Operations')
    await menu.getByRole('menuitem', { name: 'Copy link' }).click()

    await expect
      .element(screen.getByText('Copied the link to OPS'))
      .toBeVisible()
    expect(copy).toHaveBeenCalledWith(`${location.origin}/p/OPS`)
  })

  it('opens the project settings from the menu', async () => {
    inProjects()
    const { screen, router } = await renderApp('/')

    const menu = await openActions(screen, 'Operations')
    await menu.getByRole('menuitem', { name: 'Settings' }).click()

    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/OPS/settings')
  })

  it('opens the archive dialog and gives the focus back to the actions', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    const menu = await openActions(screen, 'Website')
    await menu.getByRole('menuitem', { name: 'Archive project' }).click()
    const dialog = screen.getByRole('alertdialog', { name: 'Archive Website?' })
    await expect.element(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(
        sidebar(screen).getByRole('button', { name: 'Actions for Website' })
      )
      .toHaveFocus()
  })

  it('deletes a project from the menu once the key is typed', async () => {
    const requests = inProjects({
      'POST /api/projects/WEB/trash': { status: 204 },
    })
    const { screen } = await renderApp('/')

    const menu = await openActions(screen, 'Website')
    await menu.getByRole('menuitem', { name: 'Delete project' }).click()
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Website?' })
    await dialog.getByLabelText('Type WEB to confirm').fill('WEB')
    await dialog.getByRole('button', { name: 'Delete project' }).click()

    await expect.element(screen.getByText('Moved WEB to trash')).toBeVisible()
    expect(requests.map(routeOf)).toContain('POST /api/projects/WEB/trash')
  })

  it('leaves a project from the menu and drops its row', async () => {
    let left = false
    const requests = inProjects({
      'GET /api/me/projects': {
        status: 200,
        body: () => (left ? [MY_WEB] : [MY_WEB, MY_OPS]),
      },
      'DELETE /api/projects/OPS/members/1': {
        status: 204,
        body: () => {
          left = true
        },
      },
    })
    const { screen, router } = await renderApp('/p/WEB/board')

    const menu = await openActions(screen, 'Operations')
    await menu.getByRole('menuitem', { name: 'Leave project' }).click()
    await screen
      .getByRole('alertdialog', { name: 'Leave this project?' })
      .getByRole('button', { name: 'Leave project' })
      .click()

    await expect.element(screen.getByText('You left Operations.')).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
    expect(requests.map(routeOf)).toContain(
      'DELETE /api/projects/OPS/members/1'
    )
    await expect
      .element(
        sidebar(screen).getByRole('button', { name: 'Toggle Operations' })
      )
      .not.toBeInTheDocument()
  })

  it('gives the phone 44px targets, a visible star and no key', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/')

    await screen.getByRole('button', { name: 'Toggle Sidebar' }).click()
    const drawer = screen.getByRole('dialog')
    await expect
      .element(drawer.getByRole('button', { name: 'Toggle Website' }))
      .toBeVisible()
    await expect
      .element(drawer.getByRole('button', { name: 'Star Website' }))
      .toBeVisible()
    for (const name of [
      'Toggle Website',
      'Star Website',
      'Actions for Website',
      'Projects options',
      'New project',
    ]) {
      const box = drawer
        .getByRole(name === 'New project' ? 'link' : 'button', { name })
        .element()
        .getBoundingClientRect()
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    await expect
      .element(drawer.getByText('WEB', { exact: true }))
      .not.toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
  })
})
