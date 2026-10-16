import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import {
  ALICE,
  MEMBERS,
  WEB,
  anonymous,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

describe('join a project', () => {
  it('asks an anonymous visitor to sign in, then comes back to the invite', async () => {
    anonymous({ 'POST /api/auth/login': { status: 200, body: ALICE } })
    const { screen, router } = await renderApp('/invites/tok123')

    await expect
      .element(screen.getByRole('heading', { name: 'Sign in' }))
      .toBeVisible()
    expect(router.state.location.search).toEqual({
      redirect: '/invites/tok123',
    })
    await screen.getByLabelText('Email').fill('alice@example.com')
    await screen.getByLabelText('Password').fill('correct horse battery')
    await screen.getByRole('button', { name: 'Sign in' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Join a project' }))
      .toBeVisible()
  })

  it('joins and opens the project', async () => {
    const requests = inProjects({
      'POST /api/invites/tok123/accept': { status: 200, body: WEB },
      'GET /api/projects/WEB/members': { status: 200, body: MEMBERS },
    })
    const { screen, router } = await renderApp('/invites/tok123')

    await screen.getByRole('button', { name: 'Join project' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Website' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/board')
    expect(requests.map(routeOf)).toContain('POST /api/invites/tok123/accept')
  })

  it('says when the link is used or expired', async () => {
    inProjects({
      'POST /api/invites/tok123/accept': {
        status: 404,
        body: problem(404, 'Not found.'),
      },
    })
    const { screen } = await renderApp('/invites/tok123')

    await screen.getByRole('button', { name: 'Join project' }).click()

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(
        'This invite link was already used or has expired. Ask for a new one.'
      )
  })
})
