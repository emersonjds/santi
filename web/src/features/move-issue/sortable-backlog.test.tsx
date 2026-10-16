import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects, problem, routeOf } from '@/test/stub-api'

const moveOf = (number: number) =>
  `POST /api/projects/WEB/issues/${number}/move`

/** Keyboard drag (dnd-kit sensor): Space picks the row up, arrows move it, Space drops it. */
const dragWithKeys = async (
  screen: RenderResult,
  key: string,
  ...arrows: string[]
) => {
  const handle = screen.getByRole('button', { name: `Drag ${key}` })
  await expect.element(handle).toBeVisible()
  ;(handle.element() as HTMLElement).focus()
  await userEvent.keyboard('[Space]')
  await expect.element(handle).toHaveAttribute('aria-pressed', 'true')
  for (const arrow of arrows) await userEvent.keyboard(`{${arrow}}`)
  await userEvent.keyboard('[Space]')
}

const bodyOf = async (requests: Request[], route: string) =>
  requests
    .find((request) => routeOf(request) === route)
    ?.clone()
    .json()

const section = (screen: RenderResult, name: string) =>
  screen.getByRole('region', { name })

describe('planning the backlog', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('drags a row into an empty sprint at once, keeping its rank, then refreshes', async () => {
    let answer = () => {}
    const requests = inProjects({
      [moveOf(6)]: {
        status: 200,
        body: {},
        until: new Promise<void>((resolve) => (answer = resolve)),
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await dragWithKeys(screen, 'WEB-6', 'ArrowUp')

    await expect
      .element(section(screen, 'Sprint 6'))
      .toHaveTextContent('Audit the cookie banner')
    await expect
      .element(section(screen, 'Sprint 6'))
      .toHaveTextContent('1 of 1 issues visible')
    await expect
      .element(section(screen, 'Backlog'))
      .toHaveTextContent('1 of 1 issues visible')
    await expect
      .poll(() => bodyOf(requests, moveOf(6)))
      .toEqual({ sprint_id: 6 })

    answer()
    await expect
      .poll(
        () =>
          requests.filter(
            (request) => routeOf(request) === 'GET /api/projects/WEB/backlog'
          ).length
      )
      .toBe(2)
  })

  it('reorders inside a section without changing the sprint', async () => {
    const requests = inProjects({ [moveOf(7)]: { status: 200, body: {} } })
    const { screen } = await renderApp('/p/WEB/backlog')

    await dragWithKeys(screen, 'WEB-7', 'ArrowUp')

    await expect
      .poll(() => bodyOf(requests, moveOf(7)))
      .toEqual({ before: 'WEB-6' })
  })

  it('puts the row back and says why when the server refuses', async () => {
    inProjects({
      [moveOf(6)]: {
        status: 409,
        body: problem(409, 'A closed sprint takes no more issues.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await dragWithKeys(screen, 'WEB-6', 'ArrowUp')

    await expect
      .element(screen.getByText('A closed sprint takes no more issues.'))
      .toBeVisible()
    await expect
      .element(section(screen, 'Backlog'))
      .toHaveTextContent('Audit the cookie banner')
    await expect
      .element(section(screen, 'Sprint 6'))
      .toHaveTextContent('Drag issues here to plan this sprint.')
  })

  it('moves a row to the top or bottom of another section from its menu', async () => {
    const requests = inProjects({
      [moveOf(6)]: { status: 200, body: {}, until: new Promise(() => {}) },
      [moveOf(1)]: { status: 200, body: {}, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('button', { name: 'Actions for WEB-6' }).click()
    await screen.getByRole('menuitem', { name: 'Move to…' }).click()
    await screen
      .getByRole('menuitem', { name: 'Move to the top of Sprint 5' })
      .click()

    await expect
      .element(section(screen, 'Sprint 5').getByRole('listitem').first())
      .toHaveTextContent('Audit the cookie banner')
    await expect
      .poll(() => bodyOf(requests, moveOf(6)))
      .toEqual({ sprint_id: 5, before: 'WEB-4' })

    await screen.getByRole('button', { name: 'Actions for WEB-1' }).click()
    await screen.getByRole('menuitem', { name: 'Move to…' }).click()
    await screen
      .getByRole('menuitem', { name: 'Move to the bottom of Backlog' })
      .click()
    await expect
      .poll(() => bodyOf(requests, moveOf(1)))
      .toEqual({ sprint_id: null, after: 'WEB-7' })
  })

  it('offers Move to… instead of drag on a phone', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')

    await expect
      .element(screen.getByRole('button', { name: 'Actions for WEB-6' }))
      .toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Drag / }).elements()
    ).toHaveLength(0)
  })
})
