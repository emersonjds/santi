import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { inProjects, routeOf, signedIn } from '@/test/stub-api'

describe('projects page', () => {
  it('lists every project with key, type, lead and star, by name', async () => {
    inProjects()
    const { screen } = await renderApp('/projects')

    await expect
      .element(screen.getByRole('heading', { name: 'Projects', level: 1 }))
      .toBeVisible()
    const rows = screen.getByRole('table').getByRole('row')
    await expect
      .element(rows.nth(1))
      .toHaveTextContent(/Operations.*OPS.*Kanban.*Bob Stone/)
    await expect
      .element(rows.nth(2))
      .toHaveTextContent(/Website.*WEB.*Scrum.*Alice/)
    await expect
      .element(screen.getByRole('button', { name: 'Star Website' }))
      .toHaveAttribute('aria-pressed', 'true')
    await screen
      .getByRole('table')
      .getByRole('link', { name: 'Website' })
      .click()
    await expect
      .element(screen.getByRole('heading', { name: 'Website' }))
      .toBeVisible()
  })

  it('unstars a project at once', async () => {
    const requests = inProjects({
      'DELETE /api/me/stars/WEB': { status: 204, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/projects')

    const star = screen.getByRole('button', { name: 'Star Website' })
    await star.click()

    await expect.element(star).toHaveAttribute('aria-pressed', 'false')
    expect(requests.map(routeOf)).toContain('DELETE /api/me/stars/WEB')
  })

  it('offers a new project when there are none', async () => {
    signedIn()
    const { screen } = await renderApp('/projects')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    await expect
      .element(
        screen
          .getByRole('main')
          .getByRole('link', { name: 'New project' })
          .last()
      )
      .toBeVisible()
  })
})
