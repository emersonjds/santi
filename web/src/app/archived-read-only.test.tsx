import { beforeEach, describe, expect, it } from 'vitest'
import { type Locator, page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  OPS,
  OPS_BOARD,
  WEB,
  inProjects,
  routeOf,
  type stubApi,
} from '@/test/stub-api'

const NOTE = 'archived-note'
// Playwright counts aria-disabled as disabled; the tests click anyway, as a user can.
const FORCE = { force: true }

const archived = (replies: Parameters<typeof stubApi>[0] = {}) =>
  inProjects({
    'GET /api/projects/WEB': {
      status: 200,
      body: { ...WEB, state: 'archived' },
    },
    ...replies,
  })

/** Every write the page sent; visits and views are reads the server records. */
const writesOf = (requests: Request[]) =>
  requests
    .filter((request) => request.method !== 'GET')
    .map(routeOf)
    .filter((route) => !/\/(visit|view)$/.test(route))

/** Lets a lazy dialog whose chunk is already loaded mount, had the click opened it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

const expectLocked = async (control: Locator) => {
  await expect.element(control).toHaveAttribute('aria-disabled', 'true')
  await expect.element(control).toHaveAttribute('aria-describedby', NOTE)
}

describe('an archived project (SAN-70 Q3)', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('keeps the board readable with every write control off', async () => {
    const requests = archived()
    const { screen } = await renderApp('/p/WEB/board')
    const board = screen.getByRole('region', { name: 'Board' })

    await expect
      .element(screen.getByText('This project is archived and read-only.'))
      .toHaveAttribute('id', NOTE)
    await userEvent.keyboard('j')
    await expect
      .element(board.getByRole('link', { name: /Write the release notes/ }))
      .toHaveFocus()
    await userEvent.keyboard('i')
    await board.getByRole('button', { name: 'Actions for WEB-1' }).click()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Move to…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByRole('menuitem', { name: 'Assign…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByRole('menuitem', { name: 'Delete' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByRole('menuitem', { name: 'Copy issue key' }))
      .not.toHaveAttribute('aria-disabled')
    await userEvent.keyboard('{Escape}')
    await screen.getByRole('button', { name: 'More for Sprint 4' }).click()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Edit sprint' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByRole('menuitem', { name: 'Complete sprint' }))
      .toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')

    expect(board.getByRole('button', { name: /^Drag / }).elements()).toEqual([])
    expect(board.getByText('Drop issues here').elements()).toEqual([])
    const create = board.getByRole('button', { name: 'Create issue' }).first()
    await expectLocked(create)
    await create.click(FORCE)
    await expectLocked(create)
    expect(writesOf(requests)).toEqual([])
  })

  it('drops the kanban limits and the import hint', async () => {
    inProjects({
      'GET /api/projects/OPS': {
        status: 200,
        body: { ...OPS, role: 'admin', state: 'archived' },
      },
      'GET /api/projects/OPS/board': {
        status: 200,
        body: {
          ...OPS_BOARD,
          columns: OPS_BOARD.columns.map((column) => ({
            ...column,
            cards: [],
            issue_count: 0,
          })),
        },
      },
    })
    const { screen } = await renderApp('/p/OPS/board')

    await expect
      .element(screen.getByRole('heading', { name: 'Doing' }))
      .toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Actions for column/ }).elements()
    ).toEqual([])
    expect(
      screen.getByRole('link', { name: /Bring your work/ }).elements()
    ).toEqual([])
    expect(screen.getByText('Drop issues here').elements()).toEqual([])
  })

  it('keeps the backlog readable with rows, sprints and epics locked', async () => {
    const requests = archived()
    await import('@/features/sprint/sprint-dialog')
    const { screen } = await renderApp('/p/WEB/backlog?panel=epics')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await expect
      .element(backlog.getByRole('link', { name: 'Audit the cookie banner' }))
      .toBeVisible()
    expect(
      backlog.getByRole('button', { name: /^Edit summary of/ }).elements()
    ).toEqual([])
    expect(
      backlog.getByRole('combobox', { name: /^Assignee of/ }).elements()
    ).toEqual([])
    expect(screen.getByText(/^Drag issues here/).elements()).toEqual([])
    const complete = screen.getByRole('button', { name: 'Complete sprint' })
    await expectLocked(complete)
    await complete.click(FORCE)
    await settle()
    expect(screen.getByRole('dialog').elements()).toEqual([])
    await expectLocked(screen.getByRole('button', { name: 'Create sprint' }))
    await screen.getByRole('button', { name: 'Create sprint' }).click(FORCE)
    await settle()
    expect(screen.getByRole('dialog').elements()).toEqual([])
    await expectLocked(
      screen.getByRole('button', { name: 'Add dates' }).first()
    )
    const createEpic = screen.getByRole('button', { name: 'Create epic' })
    await expectLocked(createEpic)
    await createEpic.click(FORCE)
    expect(
      screen.getByRole('textbox', { name: 'New epic summary' }).elements()
    ).toEqual([])
    await backlog.getByRole('button', { name: 'Actions for WEB-6' }).click()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Set epic' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByRole('menuitem', { name: 'Move to…' }))
      .toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    expect(writesOf(requests)).toEqual([])
  })

  it('shows the issue with its fields, comments and subtasks locked', async () => {
    const requests = archived()
    const { screen } = await renderApp('/p/WEB/issues/1')

    const summary = screen.getByRole('textbox', { name: 'Summary' })
    await expect.element(summary).toHaveValue('Write the release notes')
    await expect.element(summary).toHaveAttribute('readonly')
    await expect
      .element(screen.getByRole('spinbutton', { name: 'Points' }))
      .toHaveAttribute('readonly')
    await expectLocked(screen.getByRole('combobox', { name: 'Status' }))
    const priority = screen.getByRole('combobox', { name: 'Priority' })
    await expectLocked(priority)
    // Playwright refuses to pick in an aria-disabled select; a browser lets the user.
    const select = priority.element()
    if (!(select instanceof HTMLSelectElement)) throw new Error('not a select')
    select.value = 'high'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await expect.element(priority).toHaveValue('medium')
    await expectLocked(screen.getByRole('button', { name: 'Assign to me' }))
    await screen.getByRole('button', { name: 'Assign to me' }).click(FORCE)
    await expectLocked(screen.getByRole('button', { name: 'Add label' }))
    await screen.getByRole('button', { name: 'Add label' }).click(FORCE)
    expect(screen.getByRole('listbox').elements()).toEqual([])
    await expectLocked(
      screen.getByRole('button', { name: 'Remove label docs' })
    )
    await screen.getByRole('button', { name: 'Remove label docs' }).click(FORCE)
    await expectLocked(screen.getByRole('button', { name: 'Edit description' }))
    await screen.getByRole('button', { name: 'Edit description' }).click(FORCE)
    expect(
      screen.getByRole('textbox', { name: 'Description' }).elements()
    ).toEqual([])
    await expectLocked(screen.getByRole('button', { name: 'Add subtask' }))
    await screen.getByRole('button', { name: 'Add subtask' }).click(FORCE)
    expect(
      screen.getByRole('textbox', { name: 'Subtask summary' }).elements()
    ).toEqual([])
    await expect
      .element(screen.getByText('Draft is in the shared doc.'))
      .toBeVisible()
    const composer = screen.getByRole('button', { name: 'Add a comment…' })
    await expectLocked(composer)
    await composer.click(FORCE)
    const chips = screen
      .getByRole('group', { name: 'Quick replies' })
      .getByRole('button')
    await expectLocked(chips.first())
    expect(
      chips.elements().map((chip) => chip.getAttribute('aria-disabled'))
    ).toEqual(['true', 'true', 'true', 'true'])
    await chips.first().click(FORCE)
    await settle()
    expect(
      screen.getByRole('textbox', { name: 'Add a comment' }).elements()
    ).toEqual([])
    await screen.getByRole('button', { name: 'Comment actions' }).click()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Copy link' }))
      .not.toHaveAttribute('aria-disabled')
    expect(
      screen
        .getByRole('menuitem')
        .elements()
        .map((item) => item.textContent)
    ).toEqual(['Copy link', 'Edit', 'Delete'])
    await expectLocked(screen.getByRole('menuitem', { name: 'Edit' }))
    await expectLocked(screen.getByRole('menuitem', { name: 'Delete' }))
    await screen.getByRole('menuitem', { name: 'Delete' }).click(FORCE)
    await screen.getByRole('menuitem', { name: 'Edit' }).click(FORCE)
    await settle()
    expect(screen.getByRole('alertdialog').elements()).toEqual([])
    expect(
      screen.getByRole('textbox', { name: 'Edit comment' }).elements()
    ).toEqual([])
    await userEvent.keyboard('{Escape}')
    await expect
      .element(screen.getByRole('button', { name: 'Copy link' }))
      .not.toHaveAttribute('aria-disabled')
    const more = screen.getByRole('button', { name: 'More actions' })
    await expectLocked(more)
    await more.click(FORCE)
    expect(screen.getByRole('menu').elements()).toEqual([])
    expect(writesOf(requests)).toEqual([])
  })

  it('locks the board settings editors but keeps the danger zone', async () => {
    const requests = archived()
    const { screen, router } = await renderApp('/p/WEB/settings')

    const name = screen.getByRole('textbox', { name: 'Name of column To do' })
    await expect.element(name).toHaveAttribute('readonly')
    await expectLocked(
      screen.getByRole('button', { name: 'Drag column To do' })
    )
    await expectLocked(
      screen.getByRole('combobox', { name: 'Column of In review' })
    )
    const remove = screen.getByRole('button', { name: 'Delete column To do' })
    await expectLocked(remove)
    await remove.click(FORCE)
    expect(screen.getByRole('alertdialog').elements()).toEqual([])
    await expectLocked(screen.getByRole('button', { name: 'Add column' }))
    await screen.getByRole('button', { name: 'Add column' }).click(FORCE)
    await expectLocked(
      screen.getByRole('button', { name: 'Delete status In review' })
    )
    const chip = screen
      .getByRole('list', { name: 'Statuses in In progress' })
      .getByRole('listitem')
      .first()
    await expect.element(chip).toBeVisible()
    expect(getComputedStyle(chip.element()).cursor).not.toBe('grab')
    const importLink = screen.getByRole('link', { name: 'Import issues' })
    await expectLocked(importLink)
    await importLink.click(FORCE)
    expect(router.state.location.pathname).toBe('/p/WEB/settings')
    await expect
      .element(screen.getByRole('button', { name: 'Delete project' }))
      .not.toHaveAttribute('aria-disabled')
    expect(writesOf(requests)).toEqual([])
  })

  it('locks member writes and the importer', async () => {
    const requests = archived()
    const { screen, router } = await renderApp('/p/WEB/settings/members')

    await expectLocked(
      screen.getByRole('combobox', { name: 'Role of Bob Stone' })
    )
    const remove = screen.getByRole('button', { name: 'Remove Bob Stone' })
    await expectLocked(remove)
    await remove.click(FORCE)
    expect(screen.getByRole('alertdialog').elements()).toEqual([])
    const invite = screen.getByRole('button', { name: 'Invite' })
    await expectLocked(invite.first())
    await expectLocked(invite.last())
    await invite.last().click(FORCE)
    expect(screen.getByRole('dialog').elements()).toEqual([])

    await router.navigate({
      to: '/p/$key/settings/import',
      params: { key: 'WEB' },
    })
    await expect
      .element(screen.getByText('Unarchive the project to import issues.'))
      .toBeVisible()
    expect(screen.getByText('Choose a CSV file').elements()).toEqual([])
    expect(screen.getByText(/^Step \d of 3$/).elements()).toEqual([])
    expect(writesOf(requests)).toEqual([])
  })
})
