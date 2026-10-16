import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { WEB_SETTINGS, inProjects, problem, routeOf } from '@/test/stub-api'

const MOVE = 'POST /api/projects/WEB/issues/1/move'

/** Keyboard drag (dnd-kit sensor): Space picks the card up, arrows move it, Space drops it. */
const dragWithKeys = async (
  screen: RenderResult,
  key: string,
  arrow: string
) => {
  const handle = screen.getByRole('button', { name: `Drag ${key}` })
  await expect.element(handle).toBeVisible()
  ;(handle.element() as HTMLElement).focus()
  await userEvent.keyboard('[Space]')
  await expect.element(handle).toHaveAttribute('aria-pressed', 'true')
  await userEvent.keyboard(`{${arrow}}`)
  await userEvent.keyboard('[Space]')
}

const bodyOf = async (requests: Request[], route: string) =>
  requests
    .find((request) => routeOf(request) === route)
    ?.clone()
    .json()

describe('moving cards by drag and drop', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('moves a card to the next column at once, then refreshes from the server', async () => {
    let answer = () => {}
    const requests = inProjects({
      [MOVE]: {
        status: 200,
        body: {},
        until: new Promise<void>((resolve) => (answer = resolve)),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await dragWithKeys(screen, 'WEB-1', 'ArrowRight')

    const doing = screen.getByRole('region', { name: 'In progress' })
    await expect.element(doing).toHaveTextContent('Write the release notes')
    await expect.element(doing.getByLabelText('2 issues')).toBeVisible()
    await expect
      .poll(() => bodyOf(requests, MOVE))
      .toMatchObject({
        status_id: 20,
      })
    const body = await bodyOf(requests, MOVE)
    expect([body.after, body.before]).toContain('WEB-3')

    answer()
    await expect
      .poll(
        () =>
          requests.filter(
            (request) => routeOf(request) === 'GET /api/projects/WEB/board'
          ).length
      )
      .toBe(2)
  })

  it('reorders inside a column without touching the status', async () => {
    const requests = inProjects({ [MOVE]: { status: 200, body: {} } })
    const { screen } = await renderApp('/p/WEB/board')

    await dragWithKeys(screen, 'WEB-1', 'ArrowDown')

    await expect.poll(() => bodyOf(requests, MOVE)).toEqual({ after: 'WEB-2' })
  })

  it('puts the card back and says why when the server refuses the move', async () => {
    inProjects({
      [MOVE]: {
        status: 409,
        body: problem(409, 'That status is no longer on the board.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await dragWithKeys(screen, 'WEB-1', 'ArrowRight')

    await expect
      .element(screen.getByText('That status is no longer on the board.'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('region', { name: 'To do' }))
      .toHaveTextContent('Write the release notes')
    await expect
      .element(screen.getByRole('region', { name: 'In progress' }))
      .not.toHaveTextContent('Write the release notes')
  })

  it('refuses a column that has no status to give the card', async () => {
    const requests = inProjects({
      'GET /api/projects/WEB/board/settings': {
        status: 200,
        body: {
          ...WEB_SETTINGS,
          columns: WEB_SETTINGS.columns.map((column) => ({
            ...column,
            statuses: column.id === 2 ? [] : column.statuses,
          })),
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await dragWithKeys(screen, 'WEB-1', 'ArrowRight')

    await expect
      .element(
        screen.getByText(
          'Map a status to this column before moving issues into it.'
        )
      )
      .toBeVisible()
    expect(requests.map(routeOf)).not.toContain(MOVE)
  })
})
