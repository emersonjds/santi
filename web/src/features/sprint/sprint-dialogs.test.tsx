import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { type Locator, page, userEvent } from 'vitest/browser'
import type { Backlog } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  ALICE,
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

// Planned 09:00 Nov 2 to 16:00 Nov 13, New York time (the test zone).
const PLANNED_TIMES: Backlog = {
  ...NOT_RUNNING,
  sections: [
    {
      ...PLANNED,
      sprint: {
        ...PLANNED.sprint!,
        starts_at: '2026-11-02T14:00:00Z',
        ends_at: '2026-11-13T21:00:00Z',
      },
    },
    NO_SPRINT,
  ],
}

const IN_AUCKLAND = {
  'GET /api/me': {
    status: 200,
    body: { ...ALICE, time_zone: 'Pacific/Auckland' },
  },
}

const bodyOf = async (requests: Request[], route: string) =>
  requests
    .find((request) => routeOf(request) === route)
    ?.clone()
    .json()

const countOf = (requests: Request[], route: string) =>
  requests.filter((request) => routeOf(request) === route).length

const section = (screen: RenderResult, name: string) =>
  screen.getByRole('region', { name })

const expectPair = async (
  dialog: Locator,
  bound: 'Start' | 'End',
  date: string,
  time: string
) => {
  await expect.element(dialog.getByLabelText(`${bound} date`)).toHaveValue(date)
  await expect.element(dialog.getByLabelText(`${bound} time`)).toHaveValue(time)
}

const openStart = async (
  backlog = NOT_RUNNING,
  routes: Parameters<typeof inProjects>[0] = {}
) => {
  const requests = inProjects({
    'GET /api/projects/WEB/backlog': { status: 200, body: backlog },
    'PUT /api/projects/WEB/sprints/5': { status: 200, body: {} },
    'POST /api/projects/WEB/sprints/5/start': { status: 200, body: {} },
    ...routes,
  })
  const { screen } = await renderApp('/p/WEB/backlog')
  await section(screen, 'Sprint 5')
    .getByRole('button', { name: 'Start sprint' })
    .click()
  return {
    requests,
    dialog: screen.getByRole('dialog', { name: 'Start Sprint 5' }),
  }
}

describe('sprint dialogs', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 16, 18, 0, 5))
    await page.viewport(1280, 800)
  })
  afterEach(() => vi.useRealTimers())

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

  it('edits name, goal and times, refusing an end before the start', async () => {
    const requests = inProjects({
      'PUT /api/projects/WEB/sprints/5': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Sprint 5')
      .getByRole('button', { name: 'Add dates' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Edit Sprint 5' })
    await expect
      .element(dialog)
      .toHaveTextContent('Times use your time zone (EDT).')
    await dialog.getByLabelText('Start date').fill('2026-11-02')
    await dialog.getByLabelText('Start time').fill('09:00')
    await dialog.getByLabelText('End date').fill('2026-11-02')
    await dialog.getByLabelText('End time').fill('09:00')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect.element(dialog.getByText('End after the start.')).toBeVisible()
    expect(requests.map(routeOf)).not.toContain(
      'PUT /api/projects/WEB/sprints/5'
    )

    await dialog.getByLabelText('End date').fill('2026-11-16')
    await dialog.getByLabelText('End time').fill('')
    await dialog.getByLabelText('Name').fill('Checkout')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect
      .poll(() => bodyOf(requests, 'PUT /api/projects/WEB/sprints/5'))
      .toEqual({
        name: 'Checkout',
        goal: '',
        starts_at: '2026-11-02T14:00:00.000Z',
        ends_at: '2026-11-17T04:59:00.000Z',
      })
  })

  it("writes the times as wall clock in the account's time zone", async () => {
    const requests = inProjects({
      ...IN_AUCKLAND,
      'PUT /api/projects/WEB/sprints/5': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Sprint 5')
      .getByRole('button', { name: 'Add dates' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Edit Sprint 5' })
    await expect
      .element(dialog)
      .toHaveTextContent('Times use your time zone (GMT+13).')
    await dialog.getByLabelText('Start date').fill('2026-10-21')
    await dialog.getByLabelText('Start time').fill('09:00')
    await dialog.getByLabelText('End date').fill('2026-10-22')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect
      .poll(() => bodyOf(requests, 'PUT /api/projects/WEB/sprints/5'))
      .toEqual({
        name: 'Sprint 5',
        goal: '',
        starts_at: '2026-10-20T20:00:00.000Z',
        ends_at: '2026-10-22T10:59:00.000Z',
      })
  })

  it("reads the planned times back in the account's time zone", async () => {
    inProjects({
      ...IN_AUCKLAND,
      'GET /api/projects/WEB/backlog': {
        status: 200,
        body: {
          ...PLANNED_TIMES,
          sections: [
            {
              ...PLANNED,
              sprint: {
                ...PLANNED.sprint!,
                starts_at: '2026-10-20T20:00:00Z',
                ends_at: '2026-10-22T10:59:00Z',
              },
            },
            NO_SPRINT,
          ],
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('button', { name: 'More for Sprint 5' }).click()
    await screen.getByRole('menuitem', { name: 'Edit sprint' }).click()
    const dialog = screen.getByRole('dialog', { name: 'Edit Sprint 5' })
    await expectPair(dialog, 'Start', '2026-10-21', '09:00')
    await expectPair(dialog, 'End', '2026-10-22', '23:59')
  })

  it("starts now on the account's clock", async () => {
    const { dialog } = await openStart(NOT_RUNNING, IN_AUCKLAND)

    await expectPair(dialog, 'Start', '2026-10-17', '11:00')
    await expectPair(dialog, 'End', '2026-10-31', '11:00')
  })

  it('shows the planned times and clears the end of a future sprint', async () => {
    const requests = inProjects({
      'GET /api/projects/WEB/backlog': { status: 200, body: PLANNED_TIMES },
      'PUT /api/projects/WEB/sprints/5': { status: 200, body: {} },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('button', { name: 'More for Sprint 5' }).click()
    await screen.getByRole('menuitem', { name: 'Edit sprint' }).click()
    const dialog = screen.getByRole('dialog', { name: 'Edit Sprint 5' })
    await expectPair(dialog, 'Start', '2026-11-02', '09:00')
    await expectPair(dialog, 'End', '2026-11-13', '16:00')
    await dialog.getByLabelText('End date').fill('')
    await dialog.getByLabelText('End time').fill('')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect
      .poll(() => bodyOf(requests, 'PUT /api/projects/WEB/sprints/5'))
      .toEqual({
        name: 'Sprint 5',
        goal: '',
        starts_at: '2026-11-02T14:00:00.000Z',
        ends_at: null,
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
      .toHaveTextContent(
        'Its issues go back to the backlog, in the same order.'
      )
    await dialog.getByRole('button', { name: 'Delete sprint' }).click()

    await expect
      .poll(() => countOf(requests, 'DELETE /api/projects/WEB/sprints/5'))
      .toBe(1)
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('starts now for two weeks unless another length is picked', async () => {
    const { requests, dialog } = await openStart()

    await expect
      .element(dialog)
      .toHaveTextContent('1 issue will be on the board.')
    expect(
      dialog
        .getByRole('option')
        .elements()
        .map((option) => option.textContent)
    ).toEqual(['4 hours', '1 day', '1 week', '2 weeks', '1 month', 'Custom'])
    await expect.element(dialog.getByLabelText('Duration')).toHaveValue('2w')
    await expectPair(dialog, 'Start', '2026-10-16', '18:00')
    await expectPair(dialog, 'End', '2026-10-30', '18:00')
    await expect
      .element(dialog)
      .toHaveTextContent('Times use your time zone (EDT).')

    await dialog.getByLabelText('Duration').selectOptions('4 hours')
    await expectPair(dialog, 'End', '2026-10-16', '22:00')
    await dialog.getByLabelText('Goal').fill('Pay with saved cards')
    await dialog.getByRole('button', { name: 'Start sprint' }).click()

    await expect
      .poll(() => bodyOf(requests, 'POST /api/projects/WEB/sprints/5/start'))
      .toEqual({
        starts_at: '2026-10-16T22:00:00.000Z',
        ends_at: '2026-10-17T02:00:00.000Z',
        length: '4h',
      })
    expect(await bodyOf(requests, 'PUT /api/projects/WEB/sprints/5')).toEqual({
      name: 'Sprint 5',
      goal: 'Pay with saved cards',
      starts_at: '2026-10-16T22:00:00.000Z',
      ends_at: '2026-10-17T02:00:00.000Z',
    })
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('moves the end with the start until the end is edited', async () => {
    const { requests, dialog } = await openStart()

    await dialog.getByLabelText('Duration').selectOptions('4 hours')
    await dialog.getByLabelText('Start time').fill('19:00')
    await expectPair(dialog, 'End', '2026-10-16', '23:00')
    await dialog.getByLabelText('End time').fill('23:30')
    await expect
      .element(dialog.getByLabelText('Duration'))
      .toHaveValue('custom')
    await dialog.getByLabelText('Start time').fill('18:00')
    await expectPair(dialog, 'End', '2026-10-16', '23:30')
    await dialog.getByRole('button', { name: 'Start sprint' }).click()

    await expect
      .poll(() => bodyOf(requests, 'POST /api/projects/WEB/sprints/5/start'))
      .toEqual({
        starts_at: '2026-10-16T22:00:00.000Z',
        ends_at: '2026-10-17T03:30:00.000Z',
        length: '330',
      })
  })

  it.each([
    ['1d', '1d', '23:59'],
    ['90', 'custom', '19:30'],
  ])('reopens with the remembered length %s', async (length, duration, end) => {
    const { dialog } = await openStart({
      ...NOT_RUNNING,
      sprint_length: length,
    })

    await expect
      .element(dialog.getByLabelText('Duration'))
      .toHaveValue(duration)
    await expectPair(dialog, 'End', '2026-10-16', end)
  })

  it('keeps a planned end, starts now and closes on Escape', async () => {
    const { dialog } = await openStart(PLANNED_TIMES)

    await expectPair(dialog, 'Start', '2026-10-16', '18:00')
    await expectPair(dialog, 'End', '2026-11-13', '16:00')
    await expect
      .element(dialog.getByLabelText('Duration'))
      .toHaveValue('custom')
    await dialog.getByLabelText('Start date').fill('2026-10-17')
    await expectPair(dialog, 'End', '2026-11-13', '16:00')

    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('refuses an end equal to the start without sending', async () => {
    const { requests, dialog } = await openStart()

    await dialog.getByLabelText('End date').fill('2026-10-16')
    await dialog.getByLabelText('End time').fill('18:00')
    await dialog.getByRole('button', { name: 'Start sprint' }).click()

    await expect.element(dialog.getByText('End after the start.')).toBeVisible()
    expect(requests.map(routeOf)).not.toContain(
      'PUT /api/projects/WEB/sprints/5'
    )
  })

  it('moves through the fields in reading order', async () => {
    const { dialog } = await openStart()

    await dialog.getByLabelText('Name').click()
    const seen: Element[] = []
    while (seen.at(-1)?.textContent !== 'Start sprint') {
      await userEvent.keyboard('{Tab}')
      if (document.activeElement !== seen.at(-1))
        seen.push(document.activeElement!)
    }
    expect(seen).toEqual(
      [
        dialog.getByLabelText('Duration'),
        dialog.getByLabelText('Start date'),
        dialog.getByLabelText('Start time'),
        dialog.getByLabelText('End date'),
        dialog.getByLabelText('End time'),
        dialog.getByLabelText('Goal'),
        dialog.getByRole('button', { name: 'Cancel' }),
        dialog.getByRole('button', { name: 'Start sprint' }),
      ].map((field) => field.element())
    )
  })

  it('keeps the start dialog open with the server refusal inline', async () => {
    const { dialog } = await openStart(NOT_RUNNING, {
      'POST /api/projects/WEB/sprints/5/start': {
        status: 409,
        body: problem(
          409,
          'Complete the active sprint before starting another.'
        ),
      },
    })
    await dialog.getByRole('button', { name: 'Start sprint' }).click()

    await expect
      .element(dialog.getByRole('alert'))
      .toHaveTextContent('Complete the active sprint before starting another.')
  })

  it('shows a refused end under the end date, values kept', async () => {
    const { dialog } = await openStart(NOT_RUNNING, {
      'POST /api/projects/WEB/sprints/5/start': {
        status: 422,
        body: problem(422, 'Invalid sprint.', [
          { field: 'ends_at', message: 'Pick an end within ten years.' },
        ]),
      },
    })
    await dialog.getByRole('button', { name: 'Start sprint' }).click()

    await expect
      .element(dialog.getByText('Pick an end within ten years.'))
      .toBeVisible()
    await expect
      .element(dialog.getByLabelText('End date'))
      .toHaveAttribute('aria-invalid', 'true')
    await expectPair(dialog, 'End', '2026-10-30', '18:00')
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

  it('counts from fresh data: an old backlog count waits for its refetch', async () => {
    let release = () => {}
    const fresh = new Promise<void>((resolve) => (release = resolve))
    let backlogCalls = 0
    inProjects({
      'GET /api/projects/WEB/backlog': {
        status: 200,
        body: () =>
          backlogCalls === 1
            ? {
                ...WEB_BACKLOG,
                sections: [
                  { ...ACTIVE, issue_count: 5 },
                  ...WEB_BACKLOG.sections.slice(1),
                ],
              }
            : WEB_BACKLOG,
        until: () => (++backlogCalls > 1 ? fresh : undefined),
      },
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
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await section(screen, 'Sprint 4')
      .getByRole('button', { name: 'Complete sprint' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Complete Sprint 4' })
    await expect.element(dialog).toHaveTextContent('Counting issues…')
    expect(dialog.element().textContent).not.toContain('5 open')
    release()
    await expect.element(dialog).toHaveTextContent('1 issue done · 3 open')
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
