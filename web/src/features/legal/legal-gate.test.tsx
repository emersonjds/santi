import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { problem, routeOf, signedIn } from '@/test/stub-api'

const status = (accepted: boolean) => ({
  required: true,
  terms_version: '2026-10-16',
  privacy_version: '2026-10-16',
  accepted,
})

describe('legal gate', () => {
  it('asks a signed-in user to accept changed terms before the app', async () => {
    let accepted = false
    const requests = signedIn({
      'GET /api/me/legal': { status: 200, body: () => status(accepted) },
      'POST /api/me/legal': {
        status: 200,
        body: () => {
          accepted = true
          return status(true)
        },
      },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(
        screen.getByRole('heading', { name: 'Review the updated terms' })
      )
      .toBeVisible()
    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Accept and continue' }).click()
    await expect
      .element(screen.getByText('Confirm you are 18 or older.'))
      .toBeVisible()
    expect(requests.map(routeOf)).not.toContain('POST /api/me/legal')

    await screen
      .getByRole('checkbox', { name: /I agree to the Terms of Use/ })
      .click()
    await screen.getByRole('checkbox', { name: 'I am 18 or older' }).click()
    await screen.getByRole('button', { name: 'Accept and continue' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Account (Alice)' }))
      .toBeVisible()
    const post = requests.find(
      (request) => routeOf(request) === 'POST /api/me/legal'
    )
    expect(await post?.json()).toEqual({
      accept_terms: true,
      confirm_age: true,
    })
  })

  it('shows a loader, not the app, until the status arrives', async () => {
    let arrive = () => {}
    signedIn({
      'GET /api/me/legal': {
        status: 200,
        body: status(true),
        until: new Promise<void>((resolve) => (arrive = resolve)),
      },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('status', { name: 'Checking the terms' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .not.toBeInTheDocument()
    arrive()
    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Account (Alice)' }))
      .toBeVisible()
  })

  it('keeps the app closed when the status fails to load', async () => {
    let fails = true
    signedIn({
      'GET /api/me/legal': {
        get status() {
          return fails ? 500 : 200
        },
        get body() {
          return fails ? problem(500, 'Boom.') : status(true)
        },
      },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('The terms check did not load.')
    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .not.toBeInTheDocument()
    fails = false
    await screen.getByRole('button', { name: 'Try again' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Account (Alice)' }))
      .toBeVisible()
  })

  it('lets the app through when the terms are current', async () => {
    signedIn({ 'GET /api/me/legal': { status: 200, body: status(true) } })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Account (Alice)' }))
      .toBeVisible()
  })
})
