import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { fakeXhr } from '@/test/fake-xhr'
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
const EPIC = issue({
  key: 'WEB-9',
  summary: 'Checkout revamp',
  issue_type: 'epic',
})
const BUG = issue({
  key: 'WEB-2',
  summary: 'Fix the login redirect loop',
  issue_type: 'bug',
})
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
    await dialog.getByRole('button', { name: 'Add label' }).click()
    await userEvent.keyboard('infra{Enter}{Escape}')
    await expect
      .element(dialog.getByRole('button', { name: 'Remove label infra' }))
      .toBeVisible()
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
        labels: ['infra'],
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
      'GET /api/projects/WEB/issues': {
        status: 200,
        body: { items: [EPIC], next_cursor: null },
      },
      [CREATE_WEB]: {
        status: 422,
        body: problem(422, 'Check the fields.', [
          { field: 'parent', message: 'no such issue in this project' },
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
    await dialog.getByLabelText('Epic').selectOptions('WEB-9 Checkout revamp')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect
      .element(dialog.getByText('no such issue in this project'))
      .toBeVisible()
    expect(await bodiesOf(requests, CREATE_WEB)).toEqual([
      {
        summary: 'Split the header',
        issue_type: 'story',
        priority: 'medium',
        parent: 'WEB-9',
      },
    ])
  })

  it('offers epics to a story, open stories, tasks and bugs to a subtask, and nothing to an epic', async () => {
    const requests = inProjects({
      'GET /api/projects/WEB/issues': {
        status: 200,
        body: (request: Request) => ({
          items: new URL(request.url).searchParams
            .getAll('type')
            .includes('epic')
            ? [EPIC]
            : [BUG],
          next_cursor: null,
        }),
      },
      [CREATE_WEB]: { status: 422, body: problem(422, 'Not now.') },
    })
    const { screen } = await renderApp('/p/WEB/board')
    await screen.getByRole('button', { name: 'Create', exact: true }).click()
    const dialog = createDialog(screen)

    await dialog.getByLabelText('Epic').selectOptions('WEB-9 Checkout revamp')
    await dialog.getByLabelText('Type').selectOptions('Subtask')
    await expect.element(dialog.getByLabelText('Epic')).not.toBeInTheDocument()
    await expect.element(dialog.getByLabelText('Parent')).toHaveValue('')
    await dialog
      .getByLabelText('Parent')
      .selectOptions('WEB-2 Fix the login redirect loop')
    await dialog.getByLabelText('Summary').fill('Keep the target')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect.element(dialog.getByText('Not now.')).toBeVisible()
    expect(await bodiesOf(requests, CREATE_WEB)).toEqual([
      {
        summary: 'Keep the target',
        issue_type: 'subtask',
        priority: 'medium',
        parent: 'WEB-2',
      },
    ])
    const searches = requests
      .filter((request) => routeOf(request) === 'GET /api/projects/WEB/issues')
      .map((request) => new URL(request.url).searchParams)
    expect(
      searches.some(
        (params) =>
          params.getAll('type').join() === 'story,task,bug' &&
          params.getAll('status').join() === 'todo,in_progress'
      )
    ).toBe(true)

    await dialog.getByLabelText('Type').selectOptions('Epic')
    await expect
      .element(dialog.getByLabelText('Parent'))
      .not.toBeInTheDocument()
    await expect.element(dialog.getByLabelText('Epic')).not.toBeInTheDocument()
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

  it('uploads the files queued in the dialog to the new issue, and shows a failure there with Retry', async () => {
    inProjects({
      [CREATE_WEB]: {
        status: 201,
        body: issue({ key: 'WEB-9', summary: 'Crash on save' }),
      },
      'GET /api/projects/WEB/issues/9': {
        status: 200,
        body: issue({ key: 'WEB-9', summary: 'Crash on save' }),
      },
      'GET /api/projects/WEB/issues/9/comments': {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      'GET /api/projects/WEB/issues/9/attachments': { status: 200, body: [] },
    })
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/board')
    await screen.getByRole('button', { name: 'Create', exact: true }).click()
    const dialog = createDialog(screen)
    await expect.element(dialog).toBeVisible()
    const zone = dialog.element().querySelector('[data-drop-zone]')
    const input = zone?.querySelector<HTMLInputElement>('input[type=file]')
    if (!zone || !input) throw new Error('no drop zone or file input')

    await userEvent.upload(input, new File(['%PDF'], 'trace.pdf'))
    const transfer = new DataTransfer()
    transfer.items.add(new File(['png'], 'shot.png', { type: 'image/png' }))
    zone.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      })
    )
    const chips = dialog.getByRole('list', { name: 'Files to attach' })
    await expect
      .poll(() => chips.getByRole('listitem').elements().length)
      .toBe(2)
    expect(sent).toHaveLength(0)

    await dialog.getByLabelText('Summary').fill('Crash on save')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .poll(() => sent.map((xhr) => xhr.fileName))
      .toEqual(['trace.pdf', 'shot.png'])
    for (const xhr of sent) {
      expect(xhr.url).toBe('/api/projects/WEB/issues/9/attachments')
      expect(xhr.body instanceof FormData && xhr.body.has('comment_id')).toBe(
        false
      )
    }
    sent[0].fail()
    await screen.getByRole('button', { name: 'Open' }).click()

    const row = screen
      .getByRole('region', { name: /^Attachments/ })
      .getByRole('listitem')
      .filter({ hasText: 'trace.pdf' })
    await expect
      .element(row)
      .toHaveTextContent('Upload failed. Check your connection.')
    await row.getByRole('button', { name: 'Retry' }).click()
    await expect.poll(() => sent.length).toBe(3)
  })

  it('discards the queued files on Cancel', async () => {
    inProjects()
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/board')
    const open = screen.getByRole('button', { name: 'Create', exact: true })
    await open.click()
    const dialog = createDialog(screen)
    await expect.element(dialog).toBeVisible()
    const input = dialog
      .element()
      .querySelector<HTMLInputElement>('input[type=file]')
    if (!input) throw new Error('no file input')

    await userEvent.upload(input, new File(['%PDF'], 'trace.pdf'))
    await expect
      .element(dialog.getByRole('list', { name: 'Files to attach' }))
      .toHaveTextContent('trace.pdf')
    await dialog.getByRole('button', { name: 'Remove trace.pdf' }).click()
    await userEvent.upload(input, new File(['%PDF'], 'trace.pdf'))
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(dialog).not.toBeInTheDocument()

    await open.click()
    await expect.element(dialog.getByLabelText('Summary')).toBeVisible()
    await expect
      .element(dialog.getByRole('list', { name: 'Files to attach' }))
      .not.toBeInTheDocument()
    expect(sent).toHaveLength(0)
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
  })

  it('sends one inline create for a repeated Enter, and gives the summary back on refusal', async () => {
    let answer = (_: unknown) => {}
    const requests = inProjects({
      [CREATE_WEB]: {
        status: 422,
        body: problem(422, 'Too long.'),
        until: new Promise((resolve) => (answer = resolve)),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    const todo = screen.getByRole('region', { name: 'To do' })

    await todo.getByRole('button', { name: 'Create issue' }).click()
    await todo.getByLabelText('New issue summary').fill('Tidy the footer')
    await userEvent.keyboard('{Enter}{Enter}{Enter}')

    expect(requests.filter((r) => routeOf(r) === CREATE_WEB)).toHaveLength(1)

    await expect
      .element(todo.getByLabelText('New issue summary'))
      .toHaveValue('')
    answer(undefined)
    await expect
      .element(todo.getByLabelText('New issue summary'))
      .toHaveValue('Tidy the footer')
    await expect.element(todo.getByText('Too long.')).toBeVisible()
  })

  it('creates inline at the foot of any column, with its first status (SB-23, D5)', async () => {
    const requests = inProjects({
      [CREATE_WEB]: {
        status: 201,
        body: issue({ key: 'WEB-9', summary: 'Ship it', status_id: 30 }),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    const done = screen.getByRole('region', { name: 'Done' })
    const doing = screen.getByRole('region', { name: 'In progress' })

    await done.getByRole('button', { name: 'Create issue' }).click()
    await done.getByLabelText('New issue summary').fill('Ship it')
    await userEvent.keyboard('{Enter}')
    await expect
      .element(done.getByLabelText('New issue summary'))
      .toHaveValue('')
    await doing.getByRole('button', { name: 'Create issue' }).click()
    expect(done.getByLabelText('New issue summary').elements()).toHaveLength(0)
    await doing.getByLabelText('New issue summary').fill('Review it')
    await userEvent.keyboard('{Enter}')

    await expect
      .poll(() => bodiesOf(requests, CREATE_WEB))
      .toEqual([
        {
          summary: 'Ship it',
          issue_type: 'story',
          sprint_id: 4,
          status_id: 30,
        },
        {
          summary: 'Review it',
          issue_type: 'story',
          sprint_id: 4,
          status_id: 20,
        },
      ])
  })
})
