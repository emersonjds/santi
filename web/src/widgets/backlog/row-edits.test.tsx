import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { WEB, WEB_BACKLOG, inProjects, problem, routeOf } from '@/test/stub-api'

const DELETE_7 = 'DELETE /api/projects/WEB/issues/7'
const PATCH_6 = 'PATCH /api/projects/WEB/issues/6'
const PATCH_7 = 'PATCH /api/projects/WEB/issues/7'
const pending = { status: 200, body: {}, until: new Promise(() => {}) }

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

describe('backlog row edits', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('offers Delete to a member only on the rows they reported', async () => {
    inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, role: 'member' },
      },
      'GET /api/projects/WEB/backlog': {
        status: 200,
        body: {
          ...WEB_BACKLOG,
          sections: WEB_BACKLOG.sections.map((section) => ({
            ...section,
            cards: section.cards.map((each) =>
              each.key === 'WEB-7' ? { ...each, reporter_id: 2 } : each
            ),
          })),
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: 'Actions for WEB-7' }).click()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Move to…' }))
      .toBeVisible()
    expect(
      screen.getByRole('menuitem', { name: 'Delete' }).elements()
    ).toHaveLength(0)
    await userEvent.keyboard('{Escape}')
    await backlog.getByRole('button', { name: 'Actions for WEB-6' }).click()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Delete' }))
      .toBeVisible()
  })

  it('deletes a row from its menu after asking, with the section totals', async () => {
    const requests = inProjects({
      [DELETE_7]: { status: 204, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: 'Actions for WEB-7' }).click()
    await screen.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = screen.getByRole('alertdialog', { name: 'Delete WEB-7?' })
    await expect.element(confirm).toHaveTextContent("This can't be undone.")
    await confirm.getByRole('button', { name: 'Delete issue' }).click()

    await expect
      .element(backlog.getByText('Translate the help pages'))
      .not.toBeInTheDocument()
    await expect
      .element(backlog)
      .toHaveTextContent('1 of 1 issues visible · Estimate: 0 of 0')
    expect(requests.map(routeOf)).toContain(DELETE_7)
  })

  it('edits a summary in place: Enter saves at once, Esc keeps the old one', async () => {
    const requests = inProjects({ [PATCH_7]: pending })
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: 'Edit summary of WEB-7' }).click()
    await backlog
      .getByRole('textbox', { name: 'Summary of WEB-7' })
      .fill('Translate the docs')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(backlog.getByRole('link', { name: 'Translate the docs' }))
      .toBeVisible()
    expect(await bodiesOf(requests, PATCH_7)).toEqual([
      { summary: 'Translate the docs' },
    ])

    await backlog.getByRole('button', { name: 'Edit summary of WEB-6' }).click()
    await backlog.getByRole('textbox', { name: 'Summary of WEB-6' }).fill('X')
    await userEvent.keyboard('{Escape}')

    await expect
      .element(backlog.getByRole('link', { name: 'Audit the cookie banner' }))
      .toBeVisible()
    expect(await bodiesOf(requests, PATCH_6)).toEqual([])
  })

  it('sets points and the assignee in the row, taking back what the server refuses', async () => {
    const requests = inProjects({
      [PATCH_7]: pending,
      [PATCH_6]: {
        status: 403,
        body: problem(403, 'You are not allowed to do this.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: '2 points' }).click()
    await backlog.getByRole('spinbutton', { name: 'Points of WEB-7' }).fill('5')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(backlog.getByRole('button', { name: '5 points' }))
      .toBeVisible()
    await expect.element(backlog).toHaveTextContent('Estimate: 5 of 5')
    expect(await bodiesOf(requests, PATCH_7)).toEqual([{ points: 5 }])

    await backlog
      .getByRole('combobox', { name: 'Assignee of WEB-6' })
      .selectOptions('Bob Stone')

    await expect
      .element(screen.getByText('You are not allowed to do this.'))
      .toBeVisible()
    await expect
      .element(backlog.getByRole('combobox', { name: 'Assignee of WEB-6' }))
      .toHaveValue('')
    expect(await bodiesOf(requests, PATCH_6)).toEqual([{ assignee_id: 2 }])
  })

  it('clears points and the assignee; Esc leaves points as they were', async () => {
    const requests = inProjects({
      [PATCH_7]: pending,
      'PATCH /api/projects/WEB/issues/2': pending,
    })
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: '2 points' }).click()
    await backlog.getByRole('spinbutton', { name: 'Points of WEB-7' }).fill('8')
    await userEvent.keyboard('{Escape}')
    await backlog.getByRole('button', { name: '2 points' }).click()
    await backlog.getByRole('spinbutton', { name: 'Points of WEB-7' }).fill('')
    await userEvent.keyboard('{Enter}')
    await screen
      .getByRole('region', { name: 'Sprint 4' })
      .getByRole('combobox', { name: 'Assignee of WEB-2' })
      .selectOptions('Unassigned')

    await expect
      .element(backlog.getByRole('button', { name: 'Add points to WEB-7' }))
      .toBeVisible()
    expect(await bodiesOf(requests, PATCH_7)).toEqual([{ points: null }])
    await expect
      .poll(() => bodiesOf(requests, 'PATCH /api/projects/WEB/issues/2'))
      .toEqual([{ assignee_id: null }])
  })

  it('leaves row fields to the issue dialog on a phone', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')

    await expect
      .element(screen.getByRole('link', { name: 'Audit the cookie banner' }))
      .toBeVisible()
    expect(
      screen.getByRole('button', { name: /Edit summary/ }).elements()
    ).toHaveLength(0)
    expect(
      screen.getByRole('combobox', { name: /Assignee of/ }).elements()
    ).toHaveLength(0)
  })
})
