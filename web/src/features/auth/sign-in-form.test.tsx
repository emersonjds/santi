import { describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { renderApp } from '@/test/render-app'
import { ALICE, problem, stubApi } from '@/test/stub-api'

const signIn = async (
  screen: RenderResult,
  email: string,
  password: string
) => {
  await screen.getByLabelText('Email').fill(email)
  await screen.getByLabelText('Password').fill(password)
  await screen.getByRole('button', { name: 'Sign in' }).click()
}

describe('sign in', () => {
  it('asks for both fields before calling the server', async () => {
    const requests = stubApi({})
    const { screen } = await renderApp('/login')

    await screen.getByRole('button', { name: 'Sign in' }).click()

    await expect
      .element(screen.getByText('Enter an email address.'))
      .toBeVisible()
    await expect.element(screen.getByText('Enter your password.')).toBeVisible()
    expect(requests).toHaveLength(0)
  })

  it('shows the server detail when the credentials are wrong', async () => {
    stubApi({
      'POST /api/auth/login': {
        status: 401,
        body: problem(401, 'Email or password is incorrect.'),
      },
    })
    const { screen } = await renderApp('/login')

    await signIn(screen, 'alice@example.com', 'wrong password')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Email or password is incorrect.')
  })

  it('signs in and lands on home', async () => {
    const requests = stubApi({
      'POST /api/auth/login': { status: 200, body: ALICE },
    })
    const { screen } = await renderApp('/login')

    await signIn(screen, 'alice@example.com', 'correct horse battery')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    expect(await requests[0].json()).toEqual({
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
  })

  it('returns to the page that asked for a session', async () => {
    stubApi({
      'GET /api/me': { status: 401, body: problem(401, 'Sign in first.') },
      'POST /api/auth/login': { status: 200, body: ALICE },
    })
    const { screen } = await renderApp('/projects/new')

    await signIn(screen, 'alice@example.com', 'correct horse battery')

    await expect
      .element(screen.getByRole('heading', { name: 'New project' }))
      .toBeVisible()
  })

  it('ignores a redirect to another site', async () => {
    stubApi({ 'POST /api/auth/login': { status: 200, body: ALICE } })
    const { screen, router } = await renderApp(
      '/login?redirect=%2F%2Fevil.example'
    )

    await signIn(screen, 'alice@example.com', 'correct horse battery')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/')
  })
})
