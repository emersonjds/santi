import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  WEB_BOARD,
  WEB_COMMENTS,
  inProjects,
  issue,
  problem,
  routeOf,
} from '@/test/stub-api'

const PATCH = 'PATCH /api/projects/WEB/issues/1'
const MOVE = 'POST /api/projects/WEB/issues/1/move'
const DELETE_1 = 'DELETE /api/projects/WEB/issues/1'
const DELETE_2 = 'DELETE /api/projects/WEB/issues/2'

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

  it('moves a card to a status of a column holding several (SB-17), top or bottom elsewhere', async () => {
    const requests = inProjects({
      [MOVE]: { status: 200, body: {}, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Move to…' }).click()
    await expect
      .element(
        screen.getByRole('menuitem', { name: 'Move to the bottom of Done' })
      )
      .toBeVisible()
    expect(
      screen
        .getByRole('menuitem', { name: 'Move to the bottom of In progress' })
        .elements()
    ).toHaveLength(0)
    await screen.getByRole('menuitem', { name: 'Move to In review' }).click()

    await expect
      .element(screen.getByRole('region', { name: 'In progress' }))
      .toHaveTextContent('Write the release notes')
    await expect.poll(() => bodyOf(requests, MOVE)).toEqual({ status_id: 21 })
  })

  it('keeps a pending move in place when an earlier one settles', async () => {
    let settle = (_: unknown) => {}
    const requests = inProjects({
      [MOVE]: {
        status: 200,
        body: {},
        until: new Promise((resolve) => (settle = resolve)),
      },
      'POST /api/projects/WEB/issues/2/move': {
        status: 200,
        body: {},
        until: new Promise(() => {}),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    const done = screen.getByRole('region', { name: 'Done' })
    const boardReads = () =>
      requests.filter((r) => routeOf(r) === 'GET /api/projects/WEB/board')
        .length

    for (const key of ['WEB-1', 'WEB-2']) {
      await openMenu(screen, key)
      await screen.getByRole('menuitem', { name: 'Move to…' }).click()
      await screen
        .getByRole('menuitem', { name: 'Move to the top of Done' })
        .click()
    }
    await expect.element(done).toHaveTextContent('Fix the login redirect loop')
    const before = boardReads()
    settle(undefined)
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(boardReads()).toBe(before)
    await expect.element(done).toHaveTextContent('Fix the login redirect loop')
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

  it('deletes a card and its subtasks at once, after a confirm naming what goes with it', async () => {
    const [todo, doing, done] = WEB_BOARD.columns
    // A hover preloads the board (intent); the server stops listing WEB-2 once asked to delete it.
    const afterDelete = {
      ...WEB_BOARD,
      columns: [
        { ...todo, cards: todo.cards.slice(0, 1), issue_count: 1 },
        { ...doing, cards: [], issue_count: 0 },
        done,
      ],
    }
    const deleted = () => requests.map(routeOf).includes(DELETE_2)
    const requests: Request[] = inProjects({
      'GET /api/projects/WEB/board': {
        status: 200,
        body: () => (deleted() ? afterDelete : WEB_BOARD),
      },
      'GET /api/projects/WEB/issues': {
        status: 200,
        body: {
          items: [
            issue({
              key: 'WEB-3',
              summary: 'Keep the redirect target',
              issue_type: 'subtask',
              parent_key: 'WEB-2',
            }),
          ],
          next_cursor: null,
        },
      },
      'GET /api/projects/WEB/issues/2/comments': {
        status: 200,
        body: { items: WEB_COMMENTS, next_cursor: null },
      },
      [DELETE_2]: { status: 204, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-2')
    await screen.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = screen.getByRole('alertdialog', { name: 'Delete WEB-2?' })
    await expect
      .element(confirm)
      .toHaveTextContent('Also deleted: 1 subtask and 1 comment.')
    await confirm.getByRole('button', { name: 'Delete issue' }).click()

    await expect.element(confirm).not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Fix the login redirect loop'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Keep the redirect target' }))
      .not.toBeInTheDocument()
  })

  it('puts a deleted card back when the server refuses', async () => {
    inProjects({
      [DELETE_1]: {
        status: 403,
        body: problem(403, 'You are not allowed to do this.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = screen.getByRole('alertdialog', { name: 'Delete WEB-1?' })
    await expect.element(confirm).toHaveTextContent('Also deleted: 1 comment.')
    await confirm.getByRole('button', { name: 'Delete issue' }).click()

    await expect
      .element(screen.getByText('You are not allowed to do this.'))
      .toBeVisible()
    await expect
      .element(screen.getByText('Write the release notes'))
      .toBeVisible()
  })

  it('keeps the card when the confirm is cancelled', async () => {
    const requests = inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    await openMenu(screen, 'WEB-1')
    await screen.getByRole('menuitem', { name: 'Delete' }).click()
    await screen.getByRole('button', { name: 'Cancel' }).click()

    await expect
      .element(screen.getByRole('alertdialog'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Write the release notes'))
      .toBeVisible()
    expect(requests.map(routeOf)).not.toContain(DELETE_1)
  })
})
