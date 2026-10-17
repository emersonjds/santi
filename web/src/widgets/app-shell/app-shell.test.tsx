import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { OPS, WEB, inProjects, routeOf, signedIn } from '@/test/stub-api'

const sidebar = (screen: RenderResult) =>
  screen.getByRole('navigation', { name: 'Projects and pages' })

describe('app shell', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('expands the current project in the sidebar and marks the open page', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')

    const nav = sidebar(screen)
    await expect
      .element(nav.getByRole('link', { name: 'Backlog' }))
      .toHaveAttribute('aria-current', 'page')
    await expect
      .element(nav.getByRole('link', { name: 'Board' }))
      .not.toHaveAttribute('aria-current')
    await expect
      .element(nav.getByRole('link', { name: /Operations/ }))
      .toBeVisible()
    await expect
      .element(nav.getByRole('link', { name: 'Settings' }))
      .not.toHaveAttribute('aria-current')
  })

  it('shows only the board for a kanban project', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/board')

    const nav = sidebar(screen)
    await expect
      .element(nav.getByRole('link', { name: 'Board' }))
      .toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Backlog' }).elements()).toHaveLength(
      0
    )
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

    await screen.getByRole('link', { name: 'Create' }).click()

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

const openActions = async (screen: RenderResult, name: string) => {
  await sidebar(screen)
    .getByRole('button', { name: `Actions for ${name}` })
    .click()
  return screen.getByRole('menu')
}

const itemNames = (menu: ReturnType<RenderResult['getByRole']>) =>
  menu
    .getByRole('menuitem')
    .elements()
    .map((item) => item.textContent)

describe('sidebar project row', () => {
  beforeEach(() => page.viewport(1280, 800))
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('opens the current project by default and keeps another one open once toggled', async () => {
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

    // A second app in the same page, as after a reload; the first stays mounted.
    const again = sidebar((await renderApp('/')).screen).last()
    await expect
      .element(again.getByRole('button', { name: 'Toggle Operations' }))
      .toHaveAttribute('aria-expanded', 'true')
    await expect
      .element(again.getByRole('button', { name: 'Toggle Website' }))
      .toHaveAttribute('aria-expanded', 'false')
  })

  it('collapses the current project and falls back to defaults without storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const nav = sidebar(screen)

    const web = nav.getByRole('button', { name: 'Toggle Website' })
    await expect.element(web).toHaveAttribute('aria-expanded', 'true')
    await web.click()
    await expect.element(web).toHaveAttribute('aria-expanded', 'false')
    expect(nav.getByRole('link', { name: 'Board' }).elements()).toHaveLength(0)
  })

  it('tabs from the chevron to the name to the actions', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const nav = sidebar(screen)

    const chevron = nav.getByRole('button', { name: 'Toggle Website' })
    await expect.element(chevron).toBeVisible()
    chevron.element().focus()
    await expect.element(chevron).toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(nav.getByRole('link', { name: /Website/ }))
      .toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(nav.getByRole('button', { name: 'Actions for Website' }))
      .toHaveFocus()
  })

  it('gives an admin archive and delete, and keeps the last admin from leaving', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    const menu = await openActions(screen, 'Website')
    expect(itemNames(menu)).toEqual([
      'Copy link',
      'Settings',
      'Archive project',
      'Delete project',
      'Leave project',
    ])
    const leave = menu.getByRole('menuitem', { name: 'Leave project' })
    await expect.element(leave).toHaveAttribute('aria-disabled', 'true')
    await expect.element(leave).toHaveAccessibleDescription(LAST_ADMIN)
  })

  it('gives a member copy link, settings and leave', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    const menu = await openActions(screen, 'Operations')
    await expect
      .element(menu.getByRole('menuitem', { name: 'Leave project' }))
      .toBeEnabled()
    expect(itemNames(menu)).toEqual(['Copy link', 'Settings', 'Leave project'])
  })

  it('offers no archive on an archived project', async () => {
    inProjects({
      'GET /api/projects': {
        status: 200,
        body: [{ ...WEB, state: 'archived' }, OPS],
      },
    })
    const { screen } = await renderApp('/')

    const menu = await openActions(screen, 'Website')
    await expect
      .element(menu.getByRole('menuitem', { name: 'Delete project' }))
      .toBeVisible()
    expect(
      menu.getByRole('menuitem', { name: 'Archive project' }).elements()
    ).toEqual([])
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

  it('leaves a project from the menu', async () => {
    const requests = inProjects({
      'DELETE /api/projects/OPS/members/1': { status: 204 },
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
  })

  it('gives the phone 44px targets and hides the key', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/')

    await screen.getByRole('button', { name: 'Toggle Sidebar' }).click()
    const drawer = screen.getByRole('dialog')
    await expect
      .element(drawer.getByRole('button', { name: 'Toggle Website' }))
      .toBeVisible()
    for (const name of ['Toggle Website', 'Actions for Website']) {
      const box = drawer
        .getByRole('button', { name })
        .element()
        .getBoundingClientRect()
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    await expect
      .element(drawer.getByText('WEB', { exact: true }))
      .not.toBeVisible()
  })
})
