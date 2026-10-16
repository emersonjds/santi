import { beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects, routeOf } from '@/test/stub-api'

const DELETE_7 = 'DELETE /api/projects/WEB/issues/7'

describe('backlog row edits', () => {
  beforeEach(() => page.viewport(1280, 800))

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
})
