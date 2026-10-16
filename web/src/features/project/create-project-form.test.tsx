import { describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { renderApp } from '@/test/render-app'
import {
  MEMBERS,
  OPS,
  OPS_BOARD,
  WEB,
  WEB_BOARD,
  problem,
  routeOf,
  signedIn,
} from '@/test/stub-api'

const create = (screen: RenderResult) =>
  screen.getByRole('button', { name: 'Create project' }).click()

const created = (project: typeof WEB | typeof OPS) => ({
  [`POST /api/projects`]: { status: 201, body: project },
  [`GET /api/projects/${project.key}`]: { status: 200, body: project },
  [`GET /api/projects/${project.key}/members`]: { status: 200, body: MEMBERS },
  [`GET /api/projects/${project.key}/board`]: {
    status: 200,
    body: project.key === 'OPS' ? OPS_BOARD : WEB_BOARD,
  },
})

describe('create project', () => {
  it('checks name and key before calling the server', async () => {
    const requests = signedIn()
    const { screen } = await renderApp('/projects/new')

    await screen.getByLabelText('Key').fill('1')
    await create(screen)

    await expect.element(screen.getByText('Enter a name.')).toBeVisible()
    await expect
      .element(
        screen.getByText(
          'Use 2 to 10 letters or digits, starting with a letter.'
        )
      )
      .toBeVisible()
    expect(requests.map(routeOf)).not.toContain('POST /api/projects')
  })

  it('suggests a key from the name until the key is edited', async () => {
    signedIn()
    const { screen } = await renderApp('/projects/new')
    const key = screen.getByLabelText('Key')

    await screen.getByLabelText('Name').fill('Website')
    await expect.element(key).toHaveValue('WEB')
    await screen.getByLabelText('Name').fill('Mobile app redesign')
    await expect.element(key).toHaveValue('MAR')
    await key.fill('mob')
    await screen.getByLabelText('Name').fill('Mobile')

    await expect.element(key).toHaveValue('MOB')
  })

  it('puts a taken key on the key field', async () => {
    signedIn({
      'POST /api/projects': {
        status: 409,
        body: problem(409, 'A record with these values already exists.'),
      },
    })
    const { screen } = await renderApp('/projects/new')

    await screen.getByLabelText('Name').fill('Website')
    await create(screen)

    await expect
      .element(screen.getByText('This key is already used by another project.'))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('Key'))
      .toHaveAttribute('aria-invalid', 'true')
  })

  it('puts server field errors under their fields', async () => {
    signedIn({
      'POST /api/projects': {
        status: 422,
        body: problem(422, 'Check the highlighted fields.', [
          { field: 'name', message: 'must have 1 to 100 characters' },
        ]),
      },
    })
    const { screen } = await renderApp('/projects/new')

    await screen.getByLabelText('Name').fill('Website')
    await create(screen)

    await expect
      .element(screen.getByText('must have 1 to 100 characters'))
      .toBeVisible()
  })

  it('opens a new scrum project on its backlog', async () => {
    const requests = signedIn(created(WEB))
    const { screen, router } = await renderApp('/projects/new')

    await screen.getByLabelText('Name').fill(' Website ')
    await create(screen)

    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/WEB/backlog')
    const post = requests.find(
      (request) => routeOf(request) === 'POST /api/projects'
    )
    expect(await post?.json()).toEqual({
      name: 'Website',
      key: 'WEB',
      board_type: 'scrum',
    })
  })

  it('opens a new kanban project on its board', async () => {
    const requests = signedIn(created(OPS))
    const { screen, router } = await renderApp('/projects/new')

    await screen.getByLabelText('Name').fill('Operations')
    await screen.getByRole('radio', { name: /Kanban/ }).click()
    await create(screen)

    await expect
      .element(screen.getByRole('heading', { name: 'Operations' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/OPS/board')
    const post = requests.find(
      (request) => routeOf(request) === 'POST /api/projects'
    )
    expect(await post?.json()).toMatchObject({ board_type: 'kanban' })
  })

  it('goes back home on cancel', async () => {
    signedIn()
    const { screen } = await renderApp('/projects/new')

    await screen.getByRole('link', { name: 'Cancel' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
  })
})
