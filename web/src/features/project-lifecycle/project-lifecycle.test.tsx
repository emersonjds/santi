import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  MY_OPS,
  MY_WEB,
  OPS,
  WEB,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const LAST_ADMIN =
  'You are the last admin: make another member admin first, or delete the project.'

const dangerZone = (screen: RenderResult) =>
  screen.getByRole('region', { name: 'Danger zone' })

const sidebar = (screen: RenderResult) =>
  screen.getByRole('navigation', { name: 'Projects and pages' })

/** WEB leaves the lists once `action` lands and comes back with `undo`. */
const leavesTheLists = (action: string, undo: string) => {
  let gone = false
  return inProjects({
    'GET /api/projects': {
      status: 200,
      body: () => (gone ? [OPS] : [WEB, OPS]),
    },
    'GET /api/me/projects': {
      status: 200,
      body: () => (gone ? [MY_OPS] : [MY_WEB, MY_OPS]),
    },
    [`POST /api/projects/WEB/${action}`]: {
      status: 204,
      body: () => void (gone = true),
    },
    [`POST /api/projects/WEB/${undo}`]: {
      status: 204,
      body: () => void (gone = false),
    },
  })
}

describe('project lifecycle: danger zone', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('gives an admin archive, delete and leave; the last admin cannot leave', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/settings')

    const zone = dangerZone(screen)
    await expect
      .element(zone.getByRole('button', { name: 'Archive' }))
      .toBeEnabled()
    await expect
      .element(zone.getByText('Moves to trash for 60 days; you can restore it.'))
      .toBeVisible()
    await expect
      .element(zone.getByRole('button', { name: 'Delete project' }))
      .toBeEnabled()
    const leave = zone.getByRole('button', { name: 'Leave project' })
    await expect.element(leave).toBeDisabled()
    await expect.element(leave).toHaveAccessibleDescription(LAST_ADMIN)
  })

  it('gives a member only Leave, which takes them home', async () => {
    const requests = inProjects({
      'DELETE /api/projects/OPS/members/1': { status: 204 },
    })
    const { screen, router } = await renderApp('/p/OPS/settings')

    const zone = dangerZone(screen)
    await zone.getByRole('button', { name: 'Leave project' }).click()
    expect(zone.getByRole('button', { name: 'Archive' }).elements()).toEqual([])
    expect(
      zone.getByRole('button', { name: 'Delete project' }).elements()
    ).toEqual([])
    await screen
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Leave project' })
      .click()

    await expect.element(screen.getByText('You left Operations.')).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
    expect(requests.map(routeOf)).toContain('DELETE /api/projects/OPS/members/1')
  })

  it('archives: lands on /projects, out of the lists, and Undo brings it back', async () => {
    const requests = leavesTheLists('archive', 'unarchive')
    const { screen, router } = await renderApp('/p/WEB/settings')

    await expect
      .element(sidebar(screen).getByRole('link', { name: /Website/ }))
      .toBeVisible()
    await dangerZone(screen).getByRole('button', { name: 'Archive' }).click()
    await screen
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Archive project' })
      .click()

    await expect.element(screen.getByText('Archived WEB')).toBeVisible()
    expect(router.state.location.pathname).toBe('/projects')
    await expect
      .element(sidebar(screen).getByRole('link', { name: /Website/ }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('table'))
      .not.toHaveTextContent('Website')

    await screen.getByRole('button', { name: 'Undo' }).click()
    await expect
      .element(sidebar(screen).getByRole('link', { name: /Website/ }))
      .toBeVisible()
    expect(requests.map(routeOf)).toContain('POST /api/projects/WEB/unarchive')
  })

  it('deletes only once the key is typed, then Undo restores it', async () => {
    const requests = leavesTheLists('trash', 'restore')
    const { screen, router } = await renderApp('/p/WEB/settings')

    await dangerZone(screen)
      .getByRole('button', { name: 'Delete project' })
      .click()
    const dialog = screen.getByRole('alertdialog')
    const confirm = dialog.getByRole('button', { name: 'Delete project' })
    const typed = dialog.getByLabelText('Type WEB to confirm')
    await typed.fill('web')
    await expect.element(confirm).toBeDisabled()
    await typed.fill('WEB')
    await confirm.click()

    await expect.element(screen.getByText('Moved WEB to trash')).toBeVisible()
    expect(router.state.location.pathname).toBe('/projects')
    await expect
      .element(sidebar(screen).getByRole('link', { name: /Website/ }))
      .not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Undo' }).click()
    await expect
      .element(sidebar(screen).getByRole('link', { name: /Website/ }))
      .toBeVisible()
    expect(requests.map(routeOf)).toContain('POST /api/projects/WEB/restore')
  })

  it('keeps the dialog open with the reason when the server refuses', async () => {
    inProjects({
      'POST /api/projects/WEB/trash': {
        status: 403,
        body: problem(403, 'Only project admins can do that.'),
      },
    })
    const { screen, router } = await renderApp('/p/WEB/settings')

    await dangerZone(screen)
      .getByRole('button', { name: 'Delete project' })
      .click()
    const dialog = screen.getByRole('alertdialog')
    await dialog.getByLabelText('Type WEB to confirm').fill('WEB')
    await dialog.getByRole('button', { name: 'Delete project' }).click()

    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Only project admins can do that.')
    expect(router.state.location.pathname).toBe('/p/WEB/settings')
  })
})
