import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import {
  inProjects,
  problem,
  routeOf,
  signedIn,
  stubApi,
} from '@/test/stub-api'

describe('app', () => {
  it('sends an anonymous visitor to sign in', async () => {
    stubApi({ 'GET /api/me': { status: 401, body: problem(401, 'Sign in.') } })
    const { screen, router } = await renderApp('/')

    await expect
      .element(screen.getByRole('heading', { name: 'Sign in' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ redirect: '/' })
  })

  it('sends a signed-in user away from sign in and sign up', async () => {
    signedIn()
    const { screen, router } = await renderApp('/login')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    await router.navigate({ to: '/register' })
    expect(router.state.location.pathname).toBe('/')
  })

  it('signs the user out when any query answers 401', async () => {
    signedIn({
      'GET /api/projects': { status: 401, body: problem(401, 'Sign in.') },
    })
    const { screen, router, queryClient } = await renderApp('/')

    await expect
      .element(screen.getByRole('heading', { name: 'Sign in' }))
      .toBeVisible()
    expect(router.state.location.search).toEqual({ redirect: '/' })
    expect(queryClient.getQueryData(['session'])).toBeNull()
    expect(queryClient.getQueryData(['projects'])).toBeUndefined()
  })

  it('shows a not-found page for an unknown path', async () => {
    signedIn()
    const { screen } = await renderApp('/no/such/page')

    await expect
      .element(screen.getByRole('heading', { name: 'Page not found' }))
      .toBeVisible()
    await screen.getByRole('link', { name: 'Go home' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
  })

  it('shows a not-found page for a project the user is not in', async () => {
    signedIn()
    const { screen } = await renderApp('/p/NOPE/board')

    await expect
      .element(screen.getByRole('heading', { name: 'Page not found' }))
      .toBeVisible()
  })

  it('shows an error page when the server fails', async () => {
    inProjects({
      'GET /api/projects/WEB': { status: 500, body: problem(500, 'Boom.') },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await expect
      .element(screen.getByRole('heading', { name: 'Something went wrong' }))
      .toBeVisible()
    await expect.element(screen.getByText('Boom.')).toBeVisible()
    inProjects()
    await screen.getByRole('button', { name: 'Try again' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'Website' }))
      .toBeVisible()
  })

  it('signs out from the account menu', async () => {
    const requests = signedIn({ 'POST /api/auth/logout': { status: 204 } })
    const { screen, queryClient } = await renderApp('/')

    await screen.getByRole('button', { name: 'Account' }).click()
    await expect.element(screen.getByText('alice@example.com')).toBeVisible()
    await screen.getByRole('menuitem', { name: 'Sign out' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Sign in' }))
      .toBeVisible()
    expect(requests.map(routeOf)).toContain('POST /api/auth/logout')
    expect(queryClient.getQueryData(['session'])).toBeNull()
  })

  it('links sign in and sign up to each other', async () => {
    stubApi({ 'GET /api/me': { status: 401, body: problem(401, 'Sign in.') } })
    const { screen } = await renderApp('/login')

    await screen.getByRole('link', { name: 'Create an account' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'Create an account' }))
      .toBeVisible()
    await screen.getByRole('link', { name: 'Sign in' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Sign in' }))
      .toBeVisible()
  })
})
