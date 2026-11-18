import { describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { renderApp } from '@/test/render-app'
import { ALICE, anonymous, problem, routeOf } from '@/test/stub-api'

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
    const requests = anonymous()
    const { screen } = await renderApp('/login')

    await screen.getByRole('button', { name: 'Sign in' }).click()

    await expect
      .element(screen.getByText('Enter an email address.'))
      .toBeVisible()
    await expect.element(screen.getByText('Enter your password.')).toBeVisible()
    expect(requests.map(routeOf)).toEqual(['GET /api/me'])
    await expect.element(screen.getByLabelText('Email')).toHaveFocus()
    await expect
      .element(screen.getByLabelText('Email'))
      .toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects an email without a domain and clears the message once fixed', async () => {
    const requests = anonymous()
    const { screen } = await renderApp('/login')

    await signIn(screen, 'alice', 'correct horse battery')

    await expect
      .element(screen.getByText('Enter an email address.'))
      .toBeVisible()
    expect(requests.map(routeOf)).toEqual(['GET /api/me'])
    await screen.getByLabelText('Email').fill('alice@example.com')
    await expect
      .element(screen.getByText('Enter an email address.'))
      .not.toBeInTheDocument()
  })

  it('shows the server detail when sign-ins are rate limited', async () => {
    anonymous({
      'POST /api/auth/login': {
        status: 429,
        body: problem(429, 'Too many attempts. Wait a minute and try again.'),
      },
    })
    const { screen } = await renderApp('/login')

    await signIn(screen, 'alice@example.com', 'correct horse battery')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Too many attempts. Wait a minute and try again.')
  })

  it('shows the server detail when the credentials are wrong', async () => {
    anonymous({
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
    const requests = anonymous({
      'POST /api/auth/login': { status: 200, body: ALICE },
    })
    const { screen } = await renderApp('/login')

    await signIn(screen, 'alice@example.com', 'correct horse battery')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    expect(
      await requests.find((request) => request.method === 'POST')?.json()
    ).toEqual({
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
  })

  it('returns to the page that asked for a session', async () => {
    anonymous({
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
    anonymous({ 'POST /api/auth/login': { status: 200, body: ALICE } })
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
