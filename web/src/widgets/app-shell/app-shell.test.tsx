import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects, signedIn } from '@/test/stub-api'

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

  it('marks Home as the open page on home', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    await expect
      .element(sidebar(screen).getByRole('link', { name: 'Home' }))
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
