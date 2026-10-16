import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { ALICE, problem, stubApi } from '@/test/stub-api'

const signedIn = () => stubApi({ 'GET /api/me': { status: 200, body: ALICE } })

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

  it('shows a signed-in user the empty home and the new project placeholder', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    await screen.getByRole('link', { name: 'New project' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'New project' }))
      .toBeVisible()
    await screen.getByRole('link', { name: 'Back to home' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
  })

  it('signs out back to the sign-in page', async () => {
    const requests = signedIn()
    const { screen, queryClient } = await renderApp('/')

    await screen.getByRole('button', { name: 'Sign out' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Sign in' }))
      .toBeVisible()
    expect(
      requests.map(
        (request) => request.method + ' ' + new URL(request.url).pathname
      )
    ).toContain('POST /api/auth/logout')
    expect(queryClient.getQueryData(['session'])).toBeUndefined()
  })

  it('links sign in and sign up to each other', async () => {
    stubApi({})
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
