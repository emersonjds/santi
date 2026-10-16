import { describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { renderApp } from '@/test/render-app'
import { ALICE, anonymous, problem, routeOf } from '@/test/stub-api'

const signUp = async (
  screen: RenderResult,
  name: string,
  email: string,
  password: string,
  acceptTerms = true
) => {
  await screen.getByLabelText('Name').fill(name)
  await screen.getByLabelText('Email').fill(email)
  await screen.getByLabelText('Password').fill(password)
  if (acceptTerms) {
    await terms(screen).click()
    await age(screen).click()
  }
  await screen.getByRole('button', { name: 'Create account' }).click()
}

const terms = (screen: RenderResult) =>
  screen.getByRole('checkbox', { name: /I agree to the Terms of Use/ })
const age = (screen: RenderResult) =>
  screen.getByRole('checkbox', { name: 'I am 18 or older' })

describe('sign up', () => {
  it('checks every field before calling the server', async () => {
    const requests = anonymous()
    const { screen } = await renderApp('/register')

    await signUp(screen, '  ', 'alice', 'short', false)

    await expect.element(screen.getByText('Enter your name.')).toBeVisible()
    await expect
      .element(screen.getByText('Enter an email address.'))
      .toBeVisible()
    await expect
      .element(screen.getByText('Use at least 10 characters.'))
      .toBeVisible()
    await expect
      .element(
        screen.getByText('Accept the Terms of Use and the Privacy Policy.')
      )
      .toBeVisible()
    await expect
      .element(screen.getByText('Confirm you are 18 or older.'))
      .toBeVisible()
    expect(requests.map(routeOf)).not.toContain('POST /api/auth/register')
  })

  it('links the terms and the privacy policy next to the checkbox', async () => {
    anonymous()
    const { screen } = await renderApp('/register')

    await expect
      .element(screen.getByRole('link', { name: 'Terms of Use' }))
      .toHaveAttribute('href', '/terms')
    await expect
      .element(
        screen.getByRole('link', { name: 'Privacy Policy', exact: true })
      )
      .toHaveAttribute('href', '/privacy')
    await expect.element(terms(screen)).not.toBeChecked()
    await expect.element(age(screen)).not.toBeChecked()
    await expect
      .element(screen.getByText(/We never sell your data\./))
      .toBeVisible()
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
      accept_terms: true,
      confirm_age: true,
    })
  })

  it('leaves the checkboxes out when the instance has no legal pages', async () => {
    const requests = anonymous({
      'GET /api/legal': {
        status: 200,
        body: { required: false, terms_version: 'x', privacy_version: 'x' },
      },
      'POST /api/auth/register': { status: 201, body: ALICE },
    })
    const { screen } = await renderApp('/register')

    await expect
      .element(screen.getByRole('link', { name: 'Read our privacy policy' }))
      .not.toBeInTheDocument()
    await signUp(
      screen,
      'Alice',
      'alice@example.com',
      'correct horse battery',
      false
    )

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    expect(terms(screen).elements()).toHaveLength(0)
    expect(requests.map(routeOf)).toContain('POST /api/auth/register')
  })
})
