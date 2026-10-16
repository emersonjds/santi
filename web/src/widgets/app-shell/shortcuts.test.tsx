import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects, issue, routeOf } from '@/test/stub-api'

const WEB_2 = issue({ key: 'WEB-2', summary: 'Fix the login redirect loop' })
const second = {
  'GET /api/projects/WEB/issues/2': { status: 200, body: WEB_2 },
  'GET /api/projects/WEB/issues/2/comments': {
    status: 200,
    body: { items: [], next_cursor: null },
  },
}
const pending = { status: 200, body: {}, until: new Promise(() => {}) }

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const link = (screen: RenderResult, name: string) =>
  screen.getByRole('link', { name, exact: true })

const onBoard = async (replies = {}) => {
  const requests = inProjects({ ...second, ...replies })
  const app = await renderApp('/p/WEB/board')
  // The drag layer replaces the plain lists once its chunk lands; keys pressed before that lose the focus.
  await expect
    .element(app.screen.getByRole('button', { name: 'Drag WEB-1' }))
    .toBeVisible()
  return { ...app, requests }
}

describe('keyboard shortcuts', () => {
  beforeEach(() => page.viewport(1280, 800))
  afterEach(() => localStorage.clear())

  it('moves the focus card by card with j and k, column after column, and says where it is', async () => {
    const { screen } = await onBoard()

    await userEvent.keyboard('j')
    await expect.element(link(screen, 'Write the release notes')).toHaveFocus()
    await userEvent.keyboard('jj')
    await expect.element(link(screen, 'Keep the redirect target')).toHaveFocus()
    await expect
      .element(screen.getByRole('status').filter({ hasText: 'WEB-3' }))
      .toHaveTextContent('WEB-3, In progress, 1 of 1')
    await userEvent.keyboard('k')
    await expect
      .element(link(screen, 'Fix the login redirect loop'))
      .toHaveFocus()
  })

  it('jumps to the next and previous column with n and p', async () => {
    const { screen } = await onBoard()

    await userEvent.keyboard('n')
    await expect.element(link(screen, 'Write the release notes')).toHaveFocus()
    await userEvent.keyboard('n')
    await expect.element(link(screen, 'Keep the redirect target')).toHaveFocus()
    await userEvent.keyboard('p')
    await expect.element(link(screen, 'Write the release notes')).toHaveFocus()
  })

  it('leaves keys typed in a field alone', async () => {
    const { screen } = await onBoard()
    const search = screen.getByRole('searchbox', { name: 'Search WEB' })

    await search.click()
    await userEvent.keyboard('jo?')

    await expect.element(search).toHaveValue('jo?')
    await expect.element(search).toHaveFocus()
    expect(screen.getByRole('dialog').elements()).toHaveLength(0)
  })

  it('opens the focused card with Enter or o, and steps through the board inside the dialog', async () => {
    const { screen, router } = await onBoard()

    await userEvent.keyboard('j{Enter}')
    const first = screen.getByRole('dialog', { name: 'WEB-1' })
    await expect.element(first.getByLabelText('Summary')).toBeVisible()

    await userEvent.keyboard('j')
    const next = screen.getByRole('dialog', { name: 'WEB-2' })
    await expect
      .element(next.getByLabelText('Summary'))
      .toHaveValue('Fix the login redirect loop')
    expect(router.state.location.maskedLocation?.pathname).toBe(
      '/p/WEB/issues/2'
    )
    await userEvent.keyboard('k')
    await expect
      .element(screen.getByRole('dialog', { name: 'WEB-1' }))
      .toBeVisible()
    await userEvent.keyboard('j')
    await expect.element(next).toBeVisible()

    await userEvent.keyboard('{Escape}')
    await expect.element(next).not.toBeInTheDocument()
    expect(router.state.location.search).toEqual({})
    await expect
      .element(link(screen, 'Fix the login redirect loop'))
      .toHaveFocus()

    await userEvent.keyboard('o')
    await expect.element(next).toBeVisible()
  })

  it('assigns, comments and takes the issue with a, m and i inside the dialog', async () => {
    const { screen, requests } = await onBoard({
      'PATCH /api/projects/WEB/issues/1': pending,
    })
    await userEvent.keyboard('j{Enter}')
    const dialog = screen.getByRole('dialog', { name: 'WEB-1' })
    await expect.element(dialog.getByLabelText('Summary')).toBeVisible()

    await userEvent.keyboard('a')
    await expect.element(dialog.getByLabelText('Assignee')).toHaveFocus()
    await userEvent.click(dialog.getByRole('heading', { name: 'Description' }))
    await userEvent.keyboard('m')
    await expect.element(dialog.getByLabelText('Add a comment')).toHaveFocus()
    await userEvent.click(dialog.getByRole('heading', { name: 'Description' }))
    await userEvent.keyboard('i')

    await expect
      .poll(() => bodiesOf(requests, 'PATCH /api/projects/WEB/issues/1'))
      .toEqual([{ assignee_id: 1 }])
  })

  it('assigns the focused card to the viewer with i', async () => {
    const { requests } = await onBoard({
      'PATCH /api/projects/WEB/issues/2': pending,
    })

    await userEvent.keyboard('jji')

    await expect
      .poll(() => bodiesOf(requests, 'PATCH /api/projects/WEB/issues/2'))
      .toEqual([{ assignee_id: 1 }])
  })

  it('walks the backlog rows in order, edits one with e and takes one with i', async () => {
    const requests = inProjects({
      'PATCH /api/projects/WEB/issues/6': pending,
    })
    const { screen } = await renderApp('/p/WEB/backlog')
    await expect
      .element(screen.getByRole('button', { name: 'Drag WEB-6' }))
      .toBeVisible()

    await userEvent.keyboard('jjjj')
    await expect.element(link(screen, 'Pay with a saved card')).toHaveFocus()
    await userEvent.keyboard('j')
    await expect.element(link(screen, 'Audit the cookie banner')).toHaveFocus()
    await userEvent.keyboard('i')
    await expect
      .poll(() => bodiesOf(requests, 'PATCH /api/projects/WEB/issues/6'))
      .toEqual([{ assignee_id: 1 }])

    await userEvent.keyboard('e')
    await expect
      .element(screen.getByLabelText('Summary of WEB-6'))
      .toHaveFocus()
  })

  it('goes to the board and the backlog with g b and g l, and to the search with /', async () => {
    const { screen, router } = await onBoard()

    await userEvent.keyboard('l')
    expect(router.state.location.pathname).toBe('/p/WEB/board')
    await userEvent.keyboard('gl')
    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/WEB/backlog')
    await userEvent.keyboard('gb')
    await expect.poll(() => router.state.location.pathname).toBe('/p/WEB/board')

    await userEvent.keyboard('/')
    const search = screen.getByRole('searchbox', { name: 'Search WEB' })
    await expect.element(search).toHaveFocus()
    await expect.element(search).toHaveValue('')
  })

  it('lists every shortcut on ? and turns them off and back on from there', async () => {
    const { screen } = await onBoard()

    await userEvent.keyboard('?')
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    for (const group of ['Global', 'Navigation', 'Issue actions'])
      await expect
        .element(sheet.getByRole('heading', { name: group }))
        .toBeVisible()
    for (const action of [
      'Create an issue',
      'Next issue',
      'Open the selected issue',
      'Go to the board',
      'Go to the backlog',
      'Search this project',
      'Jump to a project',
      'Assign to me',
    ])
      await expect.element(sheet.getByText(action)).toBeVisible()
    await userEvent.keyboard('j')
    await expect.element(sheet).toBeVisible()

    await sheet.getByRole('switch', { name: 'Use keyboard shortcuts' }).click()
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('j?')
    await expect
      .element(link(screen, 'Write the release notes'))
      .not.toHaveFocus()
    expect(screen.getByRole('dialog').elements()).toHaveLength(0)

    await screen.getByRole('button', { name: 'Account' }).click()
    await screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click()
    await sheet.getByRole('switch', { name: 'Use keyboard shortcuts' }).click()
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('j')
    await expect.element(link(screen, 'Write the release notes')).toHaveFocus()
  })
})
