import { describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { renderApp } from '@/test/render-app'
import { ALICE, anonymous, problem, routeOf } from '@/test/stub-api'

const signUp = async (
  screen: RenderResult,
  name: string,
  email: string,
  password: string
) => {
  await screen.getByLabelText('Name').fill(name)
  await screen.getByLabelText('Email').fill(email)
  await screen.getByLabelText('Password').fill(password)
  await screen.getByRole('button', { name: 'Create account' }).click()
}

describe('sign up', () => {
  it('checks every field before calling the server', async () => {
    const requests = anonymous()
    const { screen } = await renderApp('/register')

    await signUp(screen, '  ', 'alice', 'short')

    await expect.element(screen.getByText('Enter your name.')).toBeVisible()
    await expect
      .element(screen.getByText('Enter an email address.'))
      .toBeVisible()
    await expect
      .element(screen.getByText('Use at least 10 characters.'))
      .toBeVisible()
    expect(requests.map(routeOf)).toEqual(['GET /api/me'])
  })

  it('puts server field errors under their fields', async () => {
    anonymous({
      'POST /api/auth/register': {
        status: 422,
        body: problem(422, 'Check the highlighted fields.', [
          { field: 'email', message: 'must be an email address' },
        ]),
      },
    })
    const { screen } = await renderApp('/register')

    await signUp(screen, 'Alice', 'alice@example.test', 'correct horse battery')

    await expect
      .element(screen.getByText('must be an email address'))
      .toBeVisible()
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a problem without field errors above the button', async () => {
    anonymous({
      'POST /api/auth/register': {
        status: 409,
        body: problem(409, 'An account with this email already exists.', [
          { field: 'unknown', message: 'is not on this form' },
        ]),
      },
    })
    const { screen } = await renderApp('/register')

    await signUp(screen, 'Alice', 'alice@example.com', 'correct horse battery')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('An account with this email already exists.')
  })

  it('creates the account and lands on home', async () => {
    const requests = anonymous({
      'POST /api/auth/register': { status: 201, body: ALICE },
    })
    const { screen } = await renderApp('/register')

    await signUp(
      screen,
      ' Alice ',
      'alice@example.com',
      'correct horse battery'
    )

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    expect(
      await requests.find((request) => request.method === 'POST')?.json()
    ).toEqual({
      display_name: 'Alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    })
  })
})
