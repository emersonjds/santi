import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { WEB, inProjects, problem, signedIn } from '@/test/stub-api'

describe('home', () => {
  it('greets the user and lists their projects with type and role', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('heading', { name: 'Hi, Alice' }))
      .toBeVisible()
    const web = screen.getByRole('main').getByRole('link', { name: /Website/ })
    await expect.element(web).toHaveTextContent('WEB')
    await expect.element(web).toHaveTextContent('Scrum')
    await expect.element(web).toHaveTextContent('Admin')
    await expect
      .element(
        screen.getByRole('main').getByRole('link', { name: /Operations/ })
      )
      .toHaveTextContent('Kanban')
  })

  it('shows skeleton rows while the projects load', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => (answer = resolve))
    signedIn({ 'GET /api/projects': { status: 200, body: [WEB], until } })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('status', { name: 'Loading projects' }))
      .toBeVisible()
    answer()
    await expect
      .element(screen.getByRole('main').getByRole('link', { name: /Website/ }))
      .toBeVisible()
  })

  it('offers a new project when there are none', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    await expect
      .element(
        screen.getByText(
          'A project groups a board, its backlog and its sprints.'
        )
      )
      .toBeVisible()
    await screen
      .getByRole('main')
      .getByRole('link', { name: 'New project' })
      .click()
    await expect
      .element(screen.getByRole('heading', { name: 'New project' }))
      .toBeVisible()
  })

  it('says so when the projects fail to load, and retries', async () => {
    signedIn({
      'GET /api/projects': { status: 500, body: problem(500, 'Boom.') },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Your projects did not load.')
    signedIn()
    await screen.getByRole('button', { name: 'Try again' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
  })
})
