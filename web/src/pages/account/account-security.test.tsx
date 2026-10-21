import { describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { problem, routeOf, signedIn } from '@/test/stub-api'

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString()

const THIS = {
  id: 1,
  client: 'Firefox on Linux',
  created_at: '2026-10-01T12:00:00Z',
  last_used_at: hoursAgo(0),
  current: true,
}
const PHONE = {
  id: 2,
  client: 'Safari on iOS',
  created_at: '2026-10-02T12:00:00Z',
  last_used_at: hoursAgo(3),
  current: false,
}
const CLI = {
  id: 5,
  client: 'santi CLI',
  created_at: '2026-10-03T12:00:00Z',
  last_used_at: hoursAgo(50),
  current: false,
}
const OLD = 'old password 1'
const NEW = 'new password 22'

const change = async (
  screen: RenderResult,
  current: string,
  next: string,
  confirm = next
) => {
  await screen.getByLabelText('Current password').fill(current)
  await screen.getByLabelText('New password', { exact: true }).fill(next)
  await screen.getByLabelText('Confirm new password').fill(confirm)
  await screen.getByRole('button', { name: 'Change password' }).click()
}

const passwordPosts = (requests: Request[]) =>
  requests.filter((request) => routeOf(request) === 'POST /api/me/password')

const sessionGets = (requests: Request[]) =>
  requests.filter((request) => routeOf(request) === 'GET /api/me/sessions')

describe('account security', () => {
  it('sits between Preferences and API tokens', async () => {
    signedIn({
      'GET /api/tokens': { status: 200, body: [] },
      'GET /api/me/sessions': { status: 200, body: [THIS] },
    })
    const { screen } = await renderApp('/account')

    await expect
      .element(screen.getByRole('heading', { name: 'Security' }))
      .toBeVisible()
    const headings = screen
      .getByRole('heading', { level: 2 })
      .elements()
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      'Profile',
      'Preferences',
      'Security',
      'API tokens',
      'Your data',
    ])
    await expect
      .element(screen.getByLabelText('Current password'))
      .toHaveAttribute('autocomplete', 'current-password')
    await expect
      .element(screen.getByLabelText('New password', { exact: true }))
      .toHaveAttribute('autocomplete', 'new-password')
    await expect
      .element(screen.getByLabelText('Confirm new password'))
      .toHaveAttribute('autocomplete', 'new-password')
    await expect
      .element(screen.getByText('10 to 128 characters.'))
      .toBeVisible()
  })

  describe('change password', () => {
    it.each([
      [0, 'Password changed. No other sessions were signed out.'],
      [1, 'Password changed. 1 other session was signed out.'],
      [2, 'Password changed. 2 other sessions were signed out.'],
    ])('says how many sessions ended (%i)', async (count, message) => {
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS] },
        'POST /api/me/password': {
          status: 200,
          body: { signed_out: count },
        },
      })
      const { screen } = await renderApp('/account')
      await expect
        .element(screen.getByText('Only this device is signed in.'))
        .toBeVisible()

      await change(screen, OLD, NEW)

      await expect.element(screen.getByText(message)).toBeVisible()
      expect(await passwordPosts(requests)[0]?.json()).toEqual({
        current: OLD,
        new: NEW,
      })
      await expect
        .element(screen.getByLabelText('Current password'))
        .toHaveValue('')
      await expect
        .element(screen.getByLabelText('New password', { exact: true }))
        .toHaveValue('')
      await expect
        .element(screen.getByLabelText('Confirm new password'))
        .toHaveValue('')
      await expect
        .element(screen.getByLabelText('Current password'))
        .toHaveFocus()
      await expect.poll(() => sessionGets(requests).length).toBe(2)
    })

    it('checks the new password before calling the server', async () => {
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS] },
      })
      const { screen } = await renderApp('/account')
      await change(screen, OLD, 'short')
      await expect
        .element(screen.getByText('10 to 128 characters.'))
        .toHaveAttribute('data-slot', 'form-message')

      await change(screen, OLD, 'x'.repeat(129))
      await expect
        .element(screen.getByText('10 to 128 characters.'))
        .toHaveAttribute('data-slot', 'form-message')

      await change(screen, OLD, OLD)
      await expect
        .element(
          screen.getByText('Choose a password different from the current one.')
        )
        .toBeVisible()

      await change(screen, OLD, NEW, `${NEW}x`)
      await expect
        .element(screen.getByText('Passwords do not match.'))
        .toBeVisible()
      expect(passwordPosts(requests)).toHaveLength(0)
    })

    it('puts server refusals on their field, in its own words', async () => {
      let field = 'current'
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS] },
        'POST /api/me/password': {
          status: 422,
          body: () =>
            problem(422, 'Check the highlighted fields.', [
              { field, message: 'server words' },
            ]),
        },
      })
      const { screen } = await renderApp('/account')

      await change(screen, OLD, NEW)
      await expect
        .element(screen.getByText('The current password is not right.'))
        .toBeVisible()

      field = 'new'
      await change(screen, OLD, NEW)
      await expect
        .element(screen.getByText('10 to 128 characters.'))
        .toHaveAttribute('data-slot', 'form-message')
      expect(screen.getByText('server words').elements()).toHaveLength(0)
      expect(
        screen.getByText('Check the highlighted fields.').elements()
      ).toHaveLength(0)
    })

    it('says when to try again after too many attempts', async () => {
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS] },
      })
      const answer = globalThis.fetch
      vi.stubGlobal('fetch', async (request: Request) => {
        if (routeOf(request) !== 'POST /api/me/password') return answer(request)
        requests.push(request)
        return Response.json(problem(429, 'Slow down.'), {
          status: 429,
          headers: { 'Retry-After': '90' },
        })
      })
      const { screen } = await renderApp('/account')

      await change(screen, OLD, NEW)

      await expect
        .element(screen.getByText('Too many attempts. Try again in 2 minutes.'))
        .toBeVisible()
      expect(screen.getByText('Slow down.').elements()).toHaveLength(0)
    })

    it.each([
      [
        'a server error',
        () => Response.json(problem(500, 'Boom.'), { status: 500 }),
      ],
      [
        'a network error',
        () => {
          throw new TypeError('Failed to fetch')
        },
      ],
    ])('lets the person retry after %s', async (_, failure) => {
      let fail = true
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS] },
      })
      const answer = globalThis.fetch
      vi.stubGlobal('fetch', async (request: Request) => {
        if (routeOf(request) !== 'POST /api/me/password') return answer(request)
        if (fail) return failure()
        return Response.json({ signed_out: 0 })
      })
      const { screen } = await renderApp('/account')

      await change(screen, OLD, NEW)

      await expect
        .element(screen.getByText('Could not change the password.'))
        .toBeVisible()
      expect(screen.getByText('Boom.').elements()).toHaveLength(0)
      const submit = screen.getByRole('button', { name: 'Change password' })
      await expect.element(submit).toBeEnabled()
      fail = false
      await submit.click()
      await expect
        .element(
          screen.getByText(
            'Password changed. No other sessions were signed out.'
          )
        )
        .toBeVisible()
    })
  })

  describe('sessions', () => {
    const list = (screen: RenderResult) =>
      screen.getByRole('list', { name: 'Sessions' })

    it('lists each session in the order given, marking this device', async () => {
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS, PHONE, CLI] },
      })
      const { screen } = await renderApp('/account')

      const rows = list(screen).getByRole('listitem')
      await expect.poll(() => rows.elements().length).toBe(3)
      expect(rows.elements().map((row) => row.textContent)).toEqual([
        expect.stringContaining('Firefox on Linux'),
        expect.stringContaining('Safari on iOS'),
        expect.stringContaining('santi CLI'),
      ])
      const mine = rows.filter({ hasText: 'Firefox on Linux' })
      await expect.element(mine.getByText('This device')).toBeVisible()
      await expect
        .element(mine.getByText('Signed in Oct 1, 2026'))
        .toBeVisible()
      expect(mine.getByRole('button').elements()).toHaveLength(0)
      const phone = rows.filter({ hasText: 'Safari on iOS' })
      await expect.element(phone.getByText('Active 3 hours ago')).toBeVisible()
      await expect
        .element(phone.getByRole('button', { name: 'Sign out Safari on iOS' }))
        .toBeVisible()
      await expect
        .element(
          screen.getByRole('button', { name: 'Sign out other sessions (2)' })
        )
        .toBeVisible()
    })

    it('puts the Sessions heading above the list and the bulk sign out below it', async () => {
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS, PHONE] },
      })
      const { screen } = await renderApp('/account')
      const section = screen.getByRole('region', { name: 'Security' })
      const heading = section.getByRole('heading', {
        level: 3,
        name: 'Sessions',
      })
      const bulk = section.getByRole('button', {
        name: 'Sign out other sessions (1)',
      })

      await expect.element(bulk).toBeVisible()
      await expect.element(heading).toBeVisible()
      const box = (element: Element) => element.getBoundingClientRect()
      const rows = list(screen).element()
      expect(box(heading.element()).bottom).toBeLessThanOrEqual(box(rows).top)
      expect(box(bulk.element()).top).toBeGreaterThanOrEqual(box(rows).bottom)
      expect(
        rows.compareDocumentPosition(bulk.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })

    it('names each sign out by device, sign-in date and activity', async () => {
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': {
          status: 200,
          body: [
            THIS,
            PHONE,
            {
              ...PHONE,
              id: 3,
              created_at: '2026-10-04T12:00:00Z',
              last_used_at: hoursAgo(50),
            },
          ],
        },
      })
      const { screen } = await renderApp('/account')

      for (const name of [
        'Sign out Safari on iOS, signed in Oct 2, 2026, active 3 hours ago',
        'Sign out Safari on iOS, signed in Oct 4, 2026, active 2 days ago',
      ])
        await expect
          .element(screen.getByRole('button', { name, exact: true }))
          .toBeVisible()
    })

    it('treats a session already gone as signed out and reloads the list', async () => {
      let sessions = [THIS, PHONE, CLI]
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: () => sessions },
        'DELETE /api/me/sessions/2': {
          status: 404,
          body: () => {
            sessions = [THIS]
            return problem(404, 'Not found.')
          },
        },
      })
      const { screen } = await renderApp('/account')

      await screen
        .getByRole('button', { name: 'Sign out Safari on iOS' })
        .click()

      await expect
        .element(screen.getByText('Only this device is signed in.'))
        .toBeVisible()
      expect(screen.getByText('Could not sign out.').elements()).toHaveLength(0)
      expect(sessionGets(requests).length).toBeGreaterThanOrEqual(2)
    })

    it('signs out one session and moves focus to the next', async () => {
      let sessions = [THIS, PHONE, CLI]
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: () => sessions },
        'DELETE /api/me/sessions/2': {
          status: 204,
          body: () => {
            sessions = [THIS, CLI]
            return undefined
          },
        },
        'DELETE /api/me/sessions/5': {
          status: 204,
          body: () => {
            sessions = [THIS]
            return undefined
          },
        },
      })
      const { screen } = await renderApp('/account')

      await screen
        .getByRole('button', { name: 'Sign out Safari on iOS' })
        .click()

      await expect
        .element(screen.getByText('Signed out this session.'))
        .toBeVisible()
      await expect
        .poll(() => list(screen).getByRole('listitem').elements().length)
        .toBe(2)
      const next = screen.getByRole('button', { name: 'Sign out santi CLI' })
      await expect.element(next).toHaveFocus()
      await expect
        .element(
          screen.getByRole('button', { name: 'Sign out other sessions (1)' })
        )
        .toBeVisible()
      expect(requests.map(routeOf)).toContain('DELETE /api/me/sessions/2')

      await next.click()

      await expect
        .element(screen.getByText('Only this device is signed in.'))
        .toBeVisible()
      await expect
        .element(screen.getByRole('heading', { name: 'Security' }))
        .toHaveFocus()
    })

    it('signs out every other session at once', async () => {
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS, PHONE, CLI] },
        'DELETE /api/me/sessions': { status: 200, body: { signed_out: 2 } },
      })
      const { screen } = await renderApp('/account')

      await screen
        .getByRole('button', { name: 'Sign out other sessions (2)' })
        .click()

      await expect
        .element(screen.getByText('Signed out 2 other sessions.'))
        .toBeVisible()
      await expect
        .element(screen.getByText('Only this device is signed in.'))
        .toBeVisible()
      expect(
        screen
          .getByRole('button', { name: /Sign out other sessions/ })
          .elements()
      ).toHaveLength(0)
      expect(requests.map(routeOf)).toContain('DELETE /api/me/sessions')
    })

    it('keeps the rows and offers a retry when a sign out fails', async () => {
      let fail = true
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS, PHONE] },
        'DELETE /api/me/sessions': {
          status: 200,
          body: { signed_out: 1 },
          until: (request) =>
            fail ? Promise.reject(new TypeError(request.url)) : undefined,
        },
        'DELETE /api/me/sessions/2': {
          status: 500,
          body: problem(500, 'Boom.'),
        },
      })
      const { screen } = await renderApp('/account')

      await screen
        .getByRole('button', { name: 'Sign out Safari on iOS' })
        .click()
      await expect
        .element(screen.getByText('Could not sign out.'))
        .toBeVisible()
      expect(list(screen).getByRole('listitem').elements()).toHaveLength(2)
      expect(screen.getByText('Boom.').elements()).toHaveLength(0)
      await expect.poll(() => sessionGets(requests).length).toBe(2)

      await screen
        .getByRole('button', { name: 'Sign out other sessions (1)' })
        .click()
      await expect
        .element(screen.getByText('Could not sign out.'))
        .toBeVisible()
      expect(list(screen).getByRole('listitem').elements()).toHaveLength(2)

      fail = false
      await screen.getByRole('button', { name: 'Retry' }).click()
      await expect
        .element(screen.getByText('Signed out 1 other session.'))
        .toBeVisible()
      await expect
        .element(screen.getByText('Only this device is signed in.'))
        .toBeVisible()
    })

    it('says when only this device is signed in', async () => {
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': { status: 200, body: [THIS] },
      })
      const { screen } = await renderApp('/account')

      await expect
        .element(screen.getByText('Only this device is signed in.'))
        .toBeVisible()
      expect(
        screen
          .getByRole('button', { name: /Sign out other sessions/ })
          .elements()
      ).toHaveLength(0)
      expect(
        screen.getByRole('list', { name: 'Sessions' }).elements()
      ).toHaveLength(0)
    })

    it('offers a retry when the list does not load', async () => {
      let fail = true
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'GET /api/me/sessions': {
          status: 200,
          body: [THIS, PHONE],
          until: () =>
            fail ? Promise.reject(new TypeError('offline')) : undefined,
        },
      })
      const { screen } = await renderApp('/account')

      await expect
        .element(screen.getByText('Could not load your sessions.'))
        .toBeVisible()
      fail = false
      await screen.getByRole('button', { name: 'Retry' }).click()

      await expect
        .element(screen.getByRole('button', { name: 'Sign out Safari on iOS' }))
        .toBeVisible()
    })
  })

  it('fits 375px with 44px targets and 16px inputs', async () => {
    await page.viewport(375, 800)
    signedIn({
      'GET /api/tokens': { status: 200, body: [] },
      'GET /api/me/sessions': {
        status: 200,
        body: [
          THIS,
          { ...PHONE, client: 'A very long device label '.repeat(4).trim() },
        ],
      },
    })
    const { screen } = await renderApp('/account')
    const section = screen.getByRole('region', { name: 'Security' })

    await expect
      .element(section.getByRole('button', { name: /^Sign out A very long/ }))
      .toBeVisible()
    const small = section
      .getByRole('button')
      .elements()
      .map((button) => button.getBoundingClientRect())
      .filter((box) => box.width < 44 || box.height < 44)
    expect(small).toEqual([])
    for (const input of section.getByLabelText(/password/i).elements())
      expect(getComputedStyle(input).fontSize).toBe('16px')
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
  })
})
