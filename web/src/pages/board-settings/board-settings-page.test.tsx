import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { boardsKey } from '@/entities/issue/board-query'
import type { BoardSettings } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  OPS,
  OPS_SETTINGS,
  WEB_SETTINGS,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const D2 =
  'Done statuses belong in the rightmost column, and that column holds only done statuses.'
const OPS_ADMIN = { ...OPS, role: 'admin' }

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const held = () => {
  let release = () => {}
  const until = new Promise<void>((resolve) => (release = resolve))
  return { until, release: () => release() }
}

const columnNames = (screen: RenderResult) =>
  screen
    .getByRole('textbox', { name: /^Name of column/ })
    .elements()
    .map((input) => (input instanceof HTMLInputElement ? input.value : ''))

/** Keyboard drag; the page fits the viewport, else dnd-kit scrolls (smoothly) instead of moving. */
const dragWithKeys = async (
  screen: RenderResult,
  name: string,
  arrow: string
) => {
  await page.viewport(1280, 1800)
  const handle = screen.getByRole('button', { name })
  await expect.element(handle).toBeVisible()
  ;(handle.element() as HTMLElement).focus()
  await userEvent.keyboard('[Space]')
  await expect.element(handle).toHaveAttribute('aria-pressed', 'true')
  await userEvent.keyboard(`{${arrow}}`)
  await userEvent.keyboard('[Space]')
}

const commit = async (
  screen: RenderResult,
  role: 'textbox' | 'spinbutton',
  name: string,
  value: string
) => {
  await screen.getByRole(role, { name }).fill(value)
  await userEvent.keyboard('{Enter}')
}

describe('board settings: columns', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('adds a column with its status left of done at once, and the board picks it up', async () => {
    const reply = held()
    const requests = inProjects({
      'POST /api/projects/WEB/board/columns': {
        status: 201,
        body: WEB_SETTINGS,
        until: reply.until,
      },
    })
    const { screen, queryClient } = await renderApp('/p/WEB/board')

    await screen
      .getByRole('navigation', { name: 'Project views' })
      .getByRole('link', { name: 'Settings' })
      .click()
    await screen.getByLabelText('New column name').fill('Review')
    await screen.getByLabelText('Its status').selectOptions('in_progress')
    await screen.getByRole('button', { name: 'Add column' }).click()

    await expect
      .poll(() => columnNames(screen))
      .toEqual(['To do', 'In progress', 'Review', 'Done'])
    expect(
      await bodiesOf(requests, 'POST /api/projects/WEB/board/columns')
    ).toEqual([{ name: 'Review', new_status: 'in_progress' }])
    expect(
      screen.getByRole('spinbutton', { name: /^WIP limit/ }).elements()
    ).toHaveLength(0)

    reply.release()
    const boards = () =>
      queryClient.getQueryCache().findAll({ queryKey: boardsKey('WEB') })
    await expect
      .poll(() => boards().every((query) => query.state.isInvalidated))
      .toBe(true)
    expect(boards()).not.toHaveLength(0)
  })

  it('renames, and reorders by buttons and by keyboard drag; done stays rightmost', async () => {
    const reply = held()
    const requests = inProjects({
      'PUT /api/projects/WEB/board/columns/2': {
        status: 200,
        body: WEB_SETTINGS,
      },
      'PUT /api/projects/WEB/board/columns/order': {
        status: 200,
        body: WEB_SETTINGS,
        until: reply.until,
      },
    })
    const { screen } = await renderApp('/p/WEB/settings')

    await commit(screen, 'textbox', 'Name of column In progress', 'Doing')
    await expect
      .poll(() => bodiesOf(requests, 'PUT /api/projects/WEB/board/columns/2'))
      .toEqual([{ name: 'Doing', wip_limit: null }])
    await expect
      .poll(() => columnNames(screen))
      .toEqual(['To do', 'In progress', 'Done'])

    await screen.getByRole('button', { name: 'Move To do down' }).click()
    await expect
      .poll(() => columnNames(screen))
      .toEqual(['In progress', 'To do', 'Done'])
    reply.release()
    await expect
      .poll(() => columnNames(screen))
      .toEqual(['To do', 'In progress', 'Done'])

    await dragWithKeys(screen, 'Drag column To do', 'ArrowDown')
    await expect
      .poll(() =>
        bodiesOf(requests, 'PUT /api/projects/WEB/board/columns/order')
      )
      .toEqual([{ column_ids: [2, 1, 3] }, { column_ids: [2, 1, 3] }])

    await expect
      .element(screen.getByRole('button', { name: 'Move In progress down' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Move To do up' }))
      .toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Delete column Done' }).elements()
    ).toHaveLength(0)
  })

  it('asks where the statuses go, and puts the column back when the server refuses', async () => {
    const requests = inProjects({
      'DELETE /api/projects/WEB/board/columns/2': {
        status: 409,
        body: problem(409, D2),
      },
    })
    const { screen } = await renderApp('/p/WEB/settings')

    await screen
      .getByRole('button', { name: 'Delete column In progress' })
      .click()
    const dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByLabelText('Move its statuses to'))
      .toHaveValue('1')
    await dialog.getByLabelText('Move its statuses to').selectOptions('3')
    await dialog.getByRole('button', { name: 'Delete column' }).click()

    const deletion = requests.find(
      (request) =>
        routeOf(request) === 'DELETE /api/projects/WEB/board/columns/2'
    )
    expect(new URL(deletion?.url ?? '/', location.href).search).toBe(
      '?move_statuses_to=3'
    )
    await expect
      .element(
        screen.getByRole('region', { name: 'Columns' }).getByRole('alert')
      )
      .toHaveTextContent(D2)
    await expect
      .element(screen.getByText("Couldn't delete the column"))
      .toBeVisible()
    await expect
      .poll(() => columnNames(screen))
      .toEqual(['To do', 'In progress', 'Done'])
  })

  it('deletes an empty column without asking for a target', async () => {
    const empty: BoardSettings = {
      ...WEB_SETTINGS,
      columns: WEB_SETTINGS.columns.map((column) =>
        column.id === 2 ? { ...column, statuses: [] } : column
      ),
    }
    let settings = empty
    const requests = inProjects({
      'GET /api/projects/WEB/board/settings': {
        status: 200,
        body: () => settings,
      },
      'DELETE /api/projects/WEB/board/columns/2': {
        status: 200,
        body: () => {
          settings = {
            ...empty,
            columns: empty.columns.filter((column) => column.id !== 2),
          }
          return settings
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/settings')

    await screen
      .getByRole('button', { name: 'Delete column In progress' })
      .click()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.getByRole('combobox').elements()).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Delete column' }).click()

    await expect.poll(() => columnNames(screen)).toEqual(['To do', 'Done'])
    const deletion = requests.find(
      (request) =>
        routeOf(request) === 'DELETE /api/projects/WEB/board/columns/2'
    )
    expect(new URL(deletion?.url ?? '/', location.href).search).toBe('')
  })

  it('sets and clears a WIP limit on a kanban column (D7)', async () => {
    const settings: BoardSettings = {
      ...OPS_SETTINGS,
      columns: OPS_SETTINGS.columns.map((column) =>
        column.id === 2 ? { ...column, wip_limit: 3 } : column
      ),
    }
    const requests = inProjects({
      'GET /api/projects/OPS': { status: 200, body: OPS_ADMIN },
      'GET /api/projects/OPS/board/settings': { status: 200, body: settings },
      'PUT /api/projects/OPS/board/columns/1': { status: 200, body: settings },
      'PUT /api/projects/OPS/board/columns/2': { status: 200, body: settings },
    })
    const { screen } = await renderApp('/p/OPS/settings')

    await expect
      .element(
        screen.getByRole('spinbutton', { name: 'WIP limit of In progress' })
      )
      .toHaveValue(3)
    await commit(screen, 'spinbutton', 'WIP limit of To do', '2')
    await commit(screen, 'spinbutton', 'WIP limit of In progress', '')

    await expect
      .poll(() => bodiesOf(requests, 'PUT /api/projects/OPS/board/columns/1'))
      .toEqual([{ name: 'To do', wip_limit: 2 }])
    await expect
      .poll(() => bodiesOf(requests, 'PUT /api/projects/OPS/board/columns/2'))
      .toEqual([{ name: 'In progress', wip_limit: null }])
  })
})

describe('board settings: statuses', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('adds a status to the unmapped pool, then maps it with the column select', async () => {
    const blocked = {
      id: 40,
      name: 'Blocked',
      category: 'in_progress',
      column_id: null,
    } as const
    let settings: BoardSettings = WEB_SETTINGS
    const requests = inProjects({
      'GET /api/projects/WEB/board/settings': {
        status: 200,
        body: () => settings,
      },
      'POST /api/projects/WEB/statuses': {
        status: 201,
        body: () => {
          settings = { ...WEB_SETTINGS, unmapped: [blocked] }
          return blocked
        },
      },
      'PUT /api/projects/WEB/statuses/40': {
        status: 200,
        body: { ...blocked, column_id: 2 },
      },
    })
    const { screen } = await renderApp('/p/WEB/settings')

    await screen.getByLabelText('New status name').fill('Blocked')
    await screen.getByLabelText('Category').selectOptions('in_progress')
    await screen.getByRole('button', { name: 'Add status' }).click()

    await expect
      .element(screen.getByRole('list', { name: 'Unmapped statuses' }))
      .toHaveTextContent('Blocked')
    expect(await bodiesOf(requests, 'POST /api/projects/WEB/statuses')).toEqual(
      [{ name: 'Blocked', category: 'in_progress' }]
    )

    await screen
      .getByRole('combobox', { name: 'Column of Blocked' })
      .selectOptions('2')
    await expect
      .element(screen.getByRole('list', { name: 'Statuses in In progress' }))
      .toHaveTextContent('Blocked')
    expect(
      await bodiesOf(requests, 'PUT /api/projects/WEB/statuses/40')
    ).toEqual([{ name: 'Blocked', column_id: 2 }])
  })

  it('explains the done rule inline when the server refuses a mapping (D2)', async () => {
    inProjects({
      'PUT /api/projects/WEB/statuses/30': {
        status: 409,
        body: problem(409, D2),
      },
    })
    const { screen } = await renderApp('/p/WEB/settings')
    const statuses = screen.getByRole('region', { name: 'Statuses' })

    await screen
      .getByRole('combobox', { name: 'Column of Done' })
      .selectOptions('2')

    await expect.element(statuses.getByRole('alert')).toHaveTextContent(D2)
    await expect
      .element(screen.getByText("Couldn't save the status"))
      .toBeVisible()
    await expect
      .element(screen.getByRole('combobox', { name: 'Column of Done' }))
      .toHaveValue('3')
    await expect
      .element(screen.getByRole('list', { name: 'Statuses in Done' }))
      .toHaveTextContent('Done')
  })

  it('shows why a status in use stays, and renames one in place', async () => {
    const requests = inProjects({
      'DELETE /api/projects/WEB/statuses/21': {
        status: 409,
        body: problem(409, 'An issue holds this status.'),
      },
      'PUT /api/projects/WEB/statuses/21': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/settings')

    await screen
      .getByRole('button', { name: 'Delete status In review' })
      .click()
    await expect
      .element(
        screen.getByRole('region', { name: 'Statuses' }).getByRole('alert')
      )
      .toHaveTextContent('An issue holds this status.')
    await expect
      .element(
        screen.getByRole('textbox', { name: 'Name of status In review' })
      )
      .toBeVisible()

    await commit(screen, 'textbox', 'Name of status In review', 'Review')
    await expect
      .poll(() => bodiesOf(requests, 'PUT /api/projects/WEB/statuses/21'))
      .toEqual([{ name: 'Review', column_id: 2 }])
  })
})

describe('board settings: done window and access', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('changes how long done work stays on a kanban board (KB-23)', async () => {
    const requests = inProjects({
      'GET /api/projects/OPS': { status: 200, body: OPS_ADMIN },
      'PUT /api/projects/OPS/board/settings': {
        status: 200,
        body: OPS_SETTINGS,
      },
    })
    const { screen } = await renderApp('/p/OPS/settings')

    const window = screen.getByRole('combobox', {
      name: 'Hide done work after',
    })
    await expect.element(window).toHaveValue('14')
    await window.selectOptions('30')
    await window.selectOptions('never')

    await expect
      .poll(() => bodiesOf(requests, 'PUT /api/projects/OPS/board/settings'))
      .toEqual([{ done_window_days: 30 }, { done_window_days: null }])
  })

  it('has no done window on a scrum board', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/settings')

    await expect
      .element(screen.getByRole('heading', { name: 'Board settings' }))
      .toBeVisible()
    expect(
      screen.getByRole('combobox', { name: 'Hide done work after' }).elements()
    ).toHaveLength(0)
  })

  it('links admins to settings from the tabs and the sidebar; members get 403', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/OPS/settings')

    await expect
      .element(screen.getByText('Only project admins can change settings.'))
      .toBeVisible()
    const tabs = screen.getByRole('navigation', { name: 'Project views' })
    const sidebar = screen.getByRole('navigation', {
      name: 'Projects and pages',
    })
    expect(
      tabs.getByRole('link', { name: 'Settings' }).elements()
    ).toHaveLength(0)
    expect(
      sidebar.getByRole('link', { name: 'Settings' }).elements()
    ).toHaveLength(0)

    await router.navigate({ to: '/p/$key/board', params: { key: 'WEB' } })
    await sidebar.getByRole('link', { name: 'Settings' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'Board settings' }))
      .toBeVisible()
    await expect
      .element(tabs.getByRole('link', { name: 'Settings' }))
      .toHaveAttribute('aria-current', 'page')
  })
})
