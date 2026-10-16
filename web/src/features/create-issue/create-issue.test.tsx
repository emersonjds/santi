import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  OPS_BOARD,
  WEB_BOARD,
  card,
  inProjects,
  issue,
  problem,
  routeOf,
} from '@/test/stub-api'

const CREATE_WEB = 'POST /api/projects/WEB/issues'
const CREATE_OPS = 'POST /api/projects/OPS/issues'

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const createDialog = (screen: RenderResult) =>
  screen.getByRole('dialog', { name: 'Create issue' })

/** The board answers with the new card once the create call has landed, as the server would. */
const boardAfterCreate = (
  board: typeof OPS_BOARD,
  key: string,
  summary: string
) => {
  let created = false
  const added = {
    ...board,
    columns: board.columns.map((column, index) =>
      index === 0
        ? {
            ...column,
            cards: [
              ...column.cards,
              card({ key, summary, column_id: column.id }),
            ],
          }
        : column
    ),
  }
  return {
    board: { status: 200, body: () => (created ? added : board) },
    create: (body: unknown) => ({
      status: 201,
      body: () => {
        created = true
        return body
      },
    }),
  }
}

describe('create issue', () => {
  beforeEach(async () => {
    await page.viewport(1280, 800)
    localStorage.clear()
  })

  it('opens from + Create with the current project, and follows a project change', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    await screen.getByRole('button', { name: 'Create', exact: true }).click()

    const dialog = createDialog(screen)
    await expect.element(dialog.getByLabelText('Project')).toHaveValue('WEB')
    await expect.element(dialog.getByLabelText('Type')).toHaveValue('story')
    await expect.element(dialog.getByLabelText('Sprint')).toHaveValue('')
    await dialog.getByLabelText('Project').selectOptions('Operations')
    await expect
      .element(dialog.getByLabelText('Sprint'))
      .not.toBeInTheDocument()
  })

  it('opens with c, but not while typing', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/board')
    const search = screen.getByRole('searchbox', { name: 'Search OPS' })

    await search.fill('c')
    await userEvent.keyboard('c')
    expect(screen.getByRole('dialog').elements()).toHaveLength(0)
    await userEvent.click(screen.getByRole('heading', { name: 'Operations' }))
    await userEvent.keyboard('c')

    await expect
      .element(createDialog(screen).getByLabelText('Project'))
      .toHaveValue('OPS')
  })

  it('preselects the last project opened, else the first one', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/OPS/board')
    await expect
      .element(screen.getByRole('heading', { name: 'Operations' }))
      .toBeVisible()

    await router.navigate({ to: '/' })
    await screen.getByRole('button', { name: 'Create', exact: true }).click()
    await expect
      .element(createDialog(screen).getByLabelText('Project'))
      .toHaveValue('OPS')
    await userEvent.keyboard('{Escape}')

    localStorage.clear()
    await screen.getByRole('button', { name: 'Create', exact: true }).click()
    await expect
      .element(createDialog(screen).getByLabelText('Project'))
      .toHaveValue('WEB')
  })

  it('falls back to the first project when the browser keeps no storage', async () => {
    const blocked = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    inProjects()
    const { screen, router } = await renderApp('/p/OPS/board')
    await expect
      .element(screen.getByRole('heading', { name: 'Operations' }))
      .toBeVisible()

    await router.navigate({ to: '/' })
    await screen.getByRole('button', { name: 'Create', exact: true }).click()

    await expect
      .element(createDialog(screen).getByLabelText('Project'))
      .toHaveValue('WEB')
    vi.restoreAllMocks()
  })

  it('creates the issue, toasts a link to it and shows its card', async () => {
    const flow = boardAfterCreate(OPS_BOARD, 'OPS-4', 'Renew the domain')
    const created = issue({
      key: 'OPS-4',
      summary: 'Renew the domain',
      sprint_id: null,
    })
    const requests = inProjects({
      'GET /api/projects/OPS/board': flow.board,
      [CREATE_OPS]: flow.create(created),
      'GET /api/projects/OPS/issues/4': { status: 200, body: created },
      'GET /api/projects/OPS/issues/4/comments': {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    })
    const { screen, router } = await renderApp('/p/OPS/board')

    await screen.getByRole('button', { name: 'Create', exact: true }).click()
    const dialog = createDialog(screen)
    await dialog.getByLabelText('Type').selectOptions('Task')
    await dialog.getByLabelText('Summary').fill('Renew the domain')
    await dialog.getByLabelText('Description').fill('Before it lapses.')
    await dialog.getByLabelText('Assignee').selectOptions('Bob Stone')
    await dialog.getByLabelText('Priority').selectOptions('High')
    await dialog.getByLabelText('Points').fill('2')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('region', { name: 'To do' }))
      .toHaveTextContent('Renew the domain')
    expect(await bodiesOf(requests, CREATE_OPS)).toEqual([
      {
        summary: 'Renew the domain',
        issue_type: 'task',
        description: 'Before it lapses.',
        assignee_id: 2,
        priority: 'high',
        points: 2,
      },
    ])
    await expect.element(screen.getByText('OPS-4 created')).toBeVisible()
    await screen.getByRole('button', { name: 'Open' }).click()
    await expect
      .element(screen.getByLabelText('Summary'))
      .toHaveValue('Renew the domain')
    expect(router.state.location.pathname).toBe('/p/OPS/issues/4')
  })

  it('checks the summary first and puts refusals on their fields', async () => {
    const requests = inProjects({
      [CREATE_WEB]: {
        status: 422,
        body: problem(422, 'Check the fields.', [
          { field: 'parent', message: 'only an epic can be the parent' },
        ]),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    await screen.getByRole('button', { name: 'Create', exact: true }).click()
    const dialog = createDialog(screen)

    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect.element(dialog.getByText('Enter a summary.')).toBeVisible()
    expect(await bodiesOf(requests, CREATE_WEB)).toEqual([])

    await dialog.getByLabelText('Summary').fill('Split the header')
    await dialog.getByLabelText('Parent').fill('web-2')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect
      .element(dialog.getByText('only an epic can be the parent'))
      .toBeVisible()
    expect(await bodiesOf(requests, CREATE_WEB)).toEqual([
      {
        summary: 'Split the header',
        issue_type: 'story',
        priority: 'medium',
        parent: 'WEB-2',
      },
    ])
  })

  it('says when the project cannot take issues yet', async () => {
    inProjects({
      [CREATE_WEB]: {
        status: 409,
        body: problem(409, 'Map a to-do status to a board column first.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    await screen.getByRole('button', { name: 'Create', exact: true }).click()
    const dialog = createDialog(screen)

    await dialog.getByLabelText('Summary').fill('Split the header')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Map a to-do status to a board column first.')
  })

  it('keeps the dialog open for another, with type and sprint kept', async () => {
    const requests = inProjects({
      [CREATE_WEB]: {
        status: 201,
        body: issue({ key: 'WEB-9', summary: 'First bug', sprint_id: 5 }),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    await screen.getByRole('button', { name: 'Create', exact: true }).click()
    const dialog = createDialog(screen)

    await dialog.getByRole('switch', { name: 'Create another' }).click()
    await dialog.getByLabelText('Type').selectOptions('Bug')
    await dialog.getByLabelText('Sprint').selectOptions('Sprint 5')
    await dialog.getByLabelText('Summary').fill('First bug')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect.element(screen.getByText('WEB-9 created')).toBeVisible()
    await expect.element(dialog.getByLabelText('Summary')).toHaveValue('')
    await expect.element(dialog.getByLabelText('Type')).toHaveValue('bug')
    await expect.element(dialog.getByLabelText('Sprint')).toHaveValue('5')
    expect(await bodiesOf(requests, CREATE_WEB)).toEqual([
      {
        summary: 'First bug',
        issue_type: 'bug',
        priority: 'medium',
        sprint_id: 5,
      },
    ])
  })

  it('creates inline at the foot of the first column, in the running sprint', async () => {
    const flow = boardAfterCreate(WEB_BOARD, 'WEB-9', 'Tidy the footer')
    const requests = inProjects({
      'GET /api/projects/WEB/board': flow.board,
      [CREATE_WEB]: flow.create(
        issue({ key: 'WEB-9', summary: 'Tidy the footer' })
      ),
    })
    const { screen } = await renderApp('/p/WEB/board')
    const todo = screen.getByRole('region', { name: 'To do' })

    await todo.getByRole('button', { name: 'Create issue' }).click()
    await todo.getByLabelText('New issue type').selectOptions('Task')
    await todo.getByLabelText('New issue summary').fill('Tidy the footer')
    await userEvent.keyboard('{Enter}')

    await expect.element(todo).toHaveTextContent('Tidy the footer')
    await expect
      .element(todo.getByLabelText('New issue summary'))
      .toHaveValue('')
    expect(await bodiesOf(requests, CREATE_WEB)).toEqual([
      {
        summary: 'Tidy the footer',
        issue_type: 'task',
        sprint_id: 4,
        status_id: 10,
      },
    ])
    expect(
      screen
        .getByRole('region', { name: 'In progress' })
        .getByRole('button', { name: 'Create issue' })
        .elements()
    ).toHaveLength(0)
  })
})
