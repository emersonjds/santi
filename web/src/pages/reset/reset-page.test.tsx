import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { ALICE, anonymous, problem, routeOf } from '@/test/stub-api'

const PREVIEW = {
  email: 'alice@example.com',
  expires_at: '2026-10-20T12:00:00Z',
}

const live = {
  'GET /api/password-resets/tok123': { status: 200, body: PREVIEW },
}

const DEAD =
  'This reset link has expired or was already used. Ask the person who sent it for a new one.'

type Screen = Awaited<ReturnType<typeof renderApp>>['screen']

const choose = async (screen: Screen, password: string, confirm: string) => {
  await screen.getByLabelText('New password').fill(password)
  await screen.getByLabelText('Confirm password').fill(confirm)
  await screen.getByRole('button', { name: 'Save and sign in' }).click()
}

describe('reset a password from a link', () => {
  it('shows a placeholder while the link loads', async () => {
    anonymous({
      'GET /api/password-resets/tok123': {
        status: 200,
        body: PREVIEW,
        until: new Promise(() => {}),
      },
    })
    const { screen } = await renderApp('/reset/tok123')

    await expect
      .element(screen.getByRole('status', { name: 'Loading reset link' }))
      .toBeVisible()
  })

  it('shows the account email read-only for a live link', async () => {
    anonymous(live)
    const { screen } = await renderApp('/reset/tok123')

    await expect
      .element(screen.getByRole('heading', { name: 'Choose a new password' }))
      .toBeVisible()
    const email = screen.getByLabelText('Email')
    await expect.element(email).toHaveValue('alice@example.com')
    await expect.element(email).toHaveAttribute('readonly')
  })

  it('says a dead link is dead and offers sign-in instead', async () => {
    anonymous()
    const { screen } = await renderApp('/reset/tok123')

    await expect.element(screen.getByRole('alert')).toHaveTextContent(DEAD)
    await expect
      .element(screen.getByRole('link', { name: 'Sign in' }))
      .toHaveAttribute('href', '/login')
    expect(screen.getByLabelText('New password').elements()).toHaveLength(0)
  })

  it('offers a retry when the link could not load', async () => {
    const requests = anonymous(live)
    const answer = globalThis.fetch
    let offline = true
    vi.stubGlobal('fetch', (request: Request) =>
      offline && routeOf(request) === 'GET /api/password-resets/tok123'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : answer(request)
    )
    const { screen } = await renderApp('/reset/tok123')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent("Couldn't open this link.")
    offline = false
    await screen.getByRole('button', { name: 'Retry' }).click()

    await expect.element(screen.getByLabelText('New password')).toBeVisible()
    expect(requests.map(routeOf)).toContain('GET /api/password-resets/tok123')
  })

  it('stops when the two passwords differ', async () => {
    const requests = anonymous(live)
    const { screen } = await renderApp('/reset/tok123')

    await choose(screen, 'correct horse battery', 'correct horse battle')

    await expect
      .element(screen.getByText('Passwords do not match.'))
      .toBeVisible()
    expect(requests.map(routeOf)).not.toContain(
      'POST /api/password-resets/tok123'
    )
  })

  it('asks for at least 10 characters', async () => {
    anonymous(live)
    const { screen } = await renderApp('/reset/tok123')

    await choose(screen, 'short', 'short')

    await expect
      .element(screen.getByText('Use at least 10 characters.'))
      .toBeVisible()
  })

  it('puts a refused password message under the new password', async () => {
    anonymous({
      ...live,
      'POST /api/password-resets/tok123': {
        status: 422,
        body: problem(422, 'Invalid input.', [
          { field: 'password', message: 'Pick a less common password.' },
        ]),
      },
    })
    const { screen } = await renderApp('/reset/tok123')

    await choose(screen, 'password1234', 'password1234')

    await expect
      .element(screen.getByText('Pick a less common password.'))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('New password'))
      .toHaveAttribute('aria-invalid', 'true')
  })

  it('says when there were too many tries', async () => {
    anonymous({
      ...live,
      'POST /api/password-resets/tok123': {
        status: 429,
        body: problem(429, 'Too many attempts. Try again in a minute.'),
      },
    })
    const { screen } = await renderApp('/reset/tok123')

    await choose(screen, 'correct horse battery', 'correct horse battery')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Too many attempts. Try again in a minute.')
  })

  it('says the link died when it was used meanwhile', async () => {
    anonymous({
      ...live,
      'POST /api/password-resets/tok123': {
        status: 404,
        body: problem(404, 'Not found.'),
      },
    })
    const { screen } = await renderApp('/reset/tok123')

    await choose(screen, 'correct horse battery', 'correct horse battery')

    await expect.element(screen.getByRole('alert')).toHaveTextContent(DEAD)
  })

  it('saves, signs in and lands on the home page', async () => {
    const requests = anonymous({
      ...live,
      'POST /api/password-resets/tok123': { status: 200, body: ALICE },
    })
    const { screen, router, queryClient } = await renderApp('/reset/tok123')
    await expect.element(screen.getByLabelText('Email')).toBeVisible()
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))

    await choose(screen, 'correct horse battery', 'correct horse battery')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/')
    expect(queryClient.getQueryData(['session'])).toEqual(ALICE)
    const post = requests.find(
      (request) => routeOf(request) === 'POST /api/password-resets/tok123'
    )
    expect(await post?.json()).toEqual({ password: 'correct horse battery' })
    expect(
      requests.filter(
        (request) => routeOf(request) === 'GET /api/password-resets/tok123'
      )
    ).toHaveLength(1)
  })
})
