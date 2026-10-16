import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects, problem, routeOf } from '@/test/stub-api'

const PATCH = 'PATCH /api/projects/WEB/issues/1'
const MOVE = 'POST /api/projects/WEB/issues/1/move'

const openMenu = async (screen: RenderResult, key: string) => {
  await screen.getByRole('button', { name: `Actions for ${key}` }).click()
  return screen.getByRole('menu')
}

const bodyOf = async (requests: Request[], route: string) =>
  requests
    .find((request) => routeOf(request) === route)
    ?.clone()
    .json()

const firstCard = (screen: RenderResult) =>
  screen.getByRole('region', { name: 'To do' }).getByRole('article').first()

describe('card menu', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('moves a card to the bottom of another column', async () => {
    const requests = inProjects({
      [MOVE]: { status: 200, body: {}, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Move to…' }).click()
    await screen
      .getByRole('menuitem', { name: 'Move to the bottom of In progress' })
      .click()

    await expect
      .element(screen.getByRole('region', { name: 'In progress' }))
      .toHaveTextContent('Write the release notes')
    await expect
      .poll(() => bodyOf(requests, MOVE))
      .toEqual({ status_id: 20, after: 'WEB-3' })
  })

  it('assigns a teammate at once', async () => {
    const requests = inProjects({
      [PATCH]: { status: 200, body: {}, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Assign…' }).click()
    await screen.getByRole('menuitemradio', { name: 'Bob Stone' }).click()

    await expect
      .element(firstCard(screen).getByTitle('Assigned to Bob Stone'))
      .toBeVisible()
    await expect.poll(() => bodyOf(requests, PATCH)).toEqual({ assignee_id: 2 })
  })

  it('assigns the card to the viewer', async () => {
    const requests = inProjects({ [PATCH]: { status: 200, body: {} } })
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Assign to me' }).click()

    await expect.poll(() => bodyOf(requests, PATCH)).toEqual({ assignee_id: 1 })
  })

  it('sets the priority and undoes it when the server says no', async () => {
    const requests = inProjects({
      [PATCH]: {
        status: 403,
        body: problem(403, 'You are no longer a member of this project.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Set priority' }).click()
    await screen.getByRole('menuitemradio', { name: 'High' }).click()

    await expect
      .element(screen.getByText('You are no longer a member of this project.'))
      .toBeVisible()
    await expect
      .element(firstCard(screen).getByText('Medium priority'))
      .toBeInTheDocument()
    expect(await bodyOf(requests, PATCH)).toEqual({ priority: 'high' })
  })

  it('copies the issue key', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Copy issue key' }).click()

    await expect.element(screen.getByText('Copied WEB-1')).toBeVisible()
    expect(copy).toHaveBeenCalledWith('WEB-1')
  })

  it('is how a phone moves cards, with no drag handles', async () => {
    await page.viewport(375, 800)
    const requests = inProjects({ [MOVE]: { status: 200, body: {} } })
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Move to…' }).click()
    await screen
      .getByRole('menuitem', { name: 'Move to the top of Done' })
      .click()

    await expect.poll(() => bodyOf(requests, MOVE)).toEqual({ status_id: 30 })
    expect(
      screen.getByRole('button', { name: 'Drag WEB-1' }).elements()
    ).toHaveLength(0)
  })
})
