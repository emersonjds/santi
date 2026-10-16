import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { WEB, inProjects, problem, routeOf, signedIn } from '@/test/stub-api'

const sample = () => ({
  'GET /api/projects': { status: 200, body: [] },
  'GET /api/me/projects': { status: 200, body: [] },
  'POST /api/sample-project': { status: 201, body: WEB },
})

describe('sample project', () => {
  it('starts from the empty home and opens the sample board', async () => {
    const requests = inProjects(sample())
    const { screen, router } = await renderApp('/')

    await screen
      .getByRole('button', { name: 'Start with a sample project' })
      .click()

    await expect.poll(() => router.state.location.pathname).toBe('/p/WEB/board')
    expect(requests.map(routeOf)).toContain('POST /api/sample-project')
  })

  it('is offered next to the new project form', async () => {
    inProjects(sample())
    const { screen, router } = await renderApp('/projects/new')

    await screen
      .getByRole('button', { name: 'Start with a sample project' })
      .click()

    await expect.poll(() => router.state.location.pathname).toBe('/p/WEB/board')
  })

  it('says why when the sample cannot be made', async () => {
    signedIn({
      'POST /api/sample-project': {
        status: 429,
        body: problem(429, 'Too many attempts. Try again in 30 seconds.'),
      },
    })
    const { screen } = await renderApp('/')
    const button = screen.getByRole('button', {
      name: 'Start with a sample project',
    })

    await button.click()

    await expect
      .element(screen.getByText('Too many attempts. Try again in 30 seconds.'))
      .toBeVisible()
    await expect.element(button).toBeEnabled()
  })
})
