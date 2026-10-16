import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Backlog } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  WEB_BACKLOG,
  WEB_BOARD,
  card,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const [ACTIVE, PLANNED, EMPTY, NO_SPRINT] = WEB_BACKLOG.sections
const NOT_RUNNING: Backlog = {
  ...WEB_BACKLOG,
  sections: [PLANNED, EMPTY, NO_SPRINT],
}

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toLocaleDateString('sv')

const bodyOf = async (requests: Request[], route: string) =>
  requests
    .find((request) => routeOf(request) === route)
    ?.clone()
    .json()

const countOf = (requests: Request[], route: string) =>
  requests.filter((request) => routeOf(request) === route).length

const section = (screen: RenderResult, name: string) =>
  screen.getByRole('region', { name })

describe('sprint dialogs', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('creates a sprint, named by the server unless a name is given', async () => {
    const requests = inProjects({
      'POST /api/projects/WEB/sprints': { status: 201, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Backlog')
      .getByRole('button', { name: 'Create sprint' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Create sprint' })
    await dialog.getByLabelText('Goal').fill('Ship checkout')
    await dialog.getByRole('button', { name: 'Create sprint' }).click()

    await expect
      .poll(() => bodyOf(requests, 'POST /api/projects/WEB/sprints'))
      .toEqual({ goal: 'Ship checkout' })
    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .poll(() => countOf(requests, 'GET /api/projects/WEB/backlog'))
      .toBeGreaterThan(1)
  })

  it('edits name, goal and dates, refusing an end before the start', async () => {
    const requests = inProjects({
      'PUT /api/projects/WEB/sprints/5': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Sprint 5')
      .getByRole('button', { name: 'Add dates' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Edit Sprint 5' })
    await dialog.getByLabelText('Starts').fill('2026-11-02')
    await dialog.getByLabelText('Ends').fill('2026-11-01')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect
      .element(dialog.getByText('End on or after the start date.'))
      .toBeVisible()
    expect(requests.map(routeOf)).not.toContain(
      'PUT /api/projects/WEB/sprints/5'
    )

    await dialog.getByLabelText('Ends').fill('2026-11-16')
    await dialog.getByLabelText('Name').fill('Checkout')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect
      .poll(() => bodyOf(requests, 'PUT /api/projects/WEB/sprints/5'))
      .toEqual({
        name: 'Checkout',
        goal: '',
        start_date: '2026-11-02',
        end_date: '2026-11-16',
      })
  })

  it('deletes a planned sprint after asking; the running one has no delete', async () => {
    const requests = inProjects({
      'DELETE /api/projects/WEB/sprints/5': { status: 204 },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('button', { name: 'More for Sprint 4' }).click()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Edit sprint' }))
      .toBeVisible()
    expect(
      screen.getByRole('menuitem', { name: 'Delete sprint' }).elements()
    ).toHaveLength(0)
    await userEvent.keyboard('{Escape}')

    await screen.getByRole('button', { name: 'More for Sprint 5' }).click()
    await screen.getByRole('menuitem', { name: 'Delete sprint' }).click()
    const dialog = screen.getByRole('dialog', { name: 'Delete Sprint 5?' })
    await expect
      .element(dialog)
      .toHaveTextContent('Its 1 issue goes back to the backlog')
    await dialog.getByRole('button', { name: 'Delete sprint' }).click()

    await expect
      .poll(() => countOf(requests, 'DELETE /api/projects/WEB/sprints/5'))
      .toBe(1)
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('starts a sprint today for two weeks unless another length is picked', async () => {
    const requests = inProjects({
      'GET /api/projects/WEB/backlog': { status: 200, body: NOT_RUNNING },
      'PUT /api/projects/WEB/sprints/5': { status: 200, body: {} },
      'POST /api/projects/WEB/sprints/5/start': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Sprint 5')
      .getByRole('button', { name: 'Start sprint' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Start Sprint 5' })
    await expect
      .element(dialog)
      .toHaveTextContent('1 issue will be on the board.')
    await expect.element(dialog.getByLabelText('Starts')).toHaveValue(day(0))
    await expect.element(dialog.getByLabelText('Ends')).toHaveValue(day(14))

    await dialog.getByLabelText('Duration').selectOptions('1 week')
    await expect.element(dialog.getByLabelText('Ends')).toHaveValue(day(7))
    await dialog.getByLabelText('Goal').fill('Pay with saved cards')
    await dialog.getByRole('button', { name: 'Start sprint' }).click()

    await expect
      .poll(() => bodyOf(requests, 'POST /api/projects/WEB/sprints/5/start'))
      .toEqual({ start_date: day(0), end_date: day(7) })
    expect(await bodyOf(requests, 'PUT /api/projects/WEB/sprints/5')).toEqual({
      name: 'Sprint 5',
      goal: 'Pay with saved cards',
      start_date: day(0),
      end_date: day(7),
    })
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('keeps the start dialog open with the server refusal inline', async () => {
    inProjects({
      'GET /api/projects/WEB/backlog': { status: 200, body: NOT_RUNNING },
      'PUT /api/projects/WEB/sprints/5': { status: 200, body: {} },
      'POST /api/projects/WEB/sprints/5/start': {
        status: 409,
        body: problem(
          409,
          'Complete the active sprint before starting another.'
        ),
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Sprint 5')
      .getByRole('button', { name: 'Start sprint' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Start Sprint 5' })
    await dialog.getByRole('button', { name: 'Start sprint' }).click()

    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Complete the active sprint before starting another.')
  })

  it('completes a sprint, sending its open issues to the picked sprint', async () => {
    const requests = inProjects({
      'GET /api/projects/WEB/board': {
        status: 200,
        body: {
          ...WEB_BOARD,
          columns: WEB_BOARD.columns.map((column) =>
            column.id === 3
              ? {
                  ...column,
                  cards: [
                    card({ key: 'WEB-8', summary: 'Done', column_id: 3 }),
                  ],
                }
              : column
          ),
        },
      },
      'POST /api/projects/WEB/sprints/4/complete': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Sprint 4')
      .getByRole('button', { name: 'Complete sprint' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Complete Sprint 4' })
    await expect.element(dialog).toHaveTextContent('1 issue done · 3 open')
    await expect
      .element(dialog.getByRole('radio', { name: 'Backlog' }))
      .toBeChecked()
    await expect
      .element(dialog.getByRole('radio', { name: 'A new sprint' }))
      .toBeVisible()
    await dialog.getByRole('radio', { name: 'Sprint 5' }).click()
    await dialog.getByRole('button', { name: 'Complete sprint' }).click()

    await expect
      .poll(() => bodyOf(requests, 'POST /api/projects/WEB/sprints/4/complete'))
      .toEqual({ open_issues: { to: 'sprint', sprint_id: 5 } })
    await expect.element(dialog).not.toBeInTheDocument()
    await expect
      .poll(() => countOf(requests, 'GET /api/projects/WEB/board'))
      .toBeGreaterThan(1)
  })

  it('skips the destination when every issue is done (D13)', async () => {
    const requests = inProjects({
      'GET /api/projects/WEB/backlog': {
        status: 200,
        body: {
          ...WEB_BACKLOG,
          sections: [
            { ...ACTIVE, issue_count: 0, total_points: 0, cards: [] },
            NO_SPRINT,
          ],
        },
      },
      'POST /api/projects/WEB/sprints/4/complete': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Sprint 4')
      .getByRole('button', { name: 'Complete sprint' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Complete Sprint 4' })
    await expect.element(dialog).toHaveTextContent('Every issue is done.')
    expect(dialog.getByRole('radio').elements()).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Complete sprint' }).click()

    await expect
      .poll(() => bodyOf(requests, 'POST /api/projects/WEB/sprints/4/complete'))
      .toEqual({ open_issues: { to: 'backlog' } })
  })

  it('opens as a full-screen sheet on a phone', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Backlog')
      .getByRole('button', { name: 'Create sprint' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Create sprint' })
    await expect.element(dialog).toBeVisible()
    const box = dialog.element().getBoundingClientRect()
    expect([box.width, box.height]).toEqual([375, 800])
  })
})
