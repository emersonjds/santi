import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { applyTheme } from '@/shared/lib/theme'
import { renderApp } from '@/test/render-app'
import { ALICE, problem, routeOf, signedIn } from '@/test/stub-api'

const LAPTOP = { id: 3, name: 'laptop', created_at: '2026-10-01T12:00:00Z' }
const CI = { id: 4, name: 'ci', created_at: '2026-10-02T12:00:00Z' }
const SECRET = 'santi_9f86d081884c7d659a2feaa0c55ad015'

const create = async (screen: RenderResult, name: string) => {
  await screen.getByLabelText('Token name').fill(name)
  await screen.getByRole('button', { name: 'Create token' }).click()
}

describe('account page', () => {
  it('opens from the account menu with the email read only', async () => {
    signedIn({ 'GET /api/tokens': { status: 200, body: [LAPTOP] } })
    const { screen, router } = await renderApp('/')

    await screen.getByRole('button', { name: 'Account' }).click()
    await screen.getByRole('menuitem', { name: 'Account' }).click()

    await expect.poll(() => router.state.location.pathname).toBe('/account')
    await expect
      .element(screen.getByLabelText('Name', { exact: true }))
      .toHaveValue('Alice')
    await expect
      .element(screen.getByLabelText('Email'))
      .toHaveValue('alice@example.com')
    await expect
      .element(screen.getByLabelText('Email'))
      .toHaveAttribute('readonly')
    const row = screen.getByRole('listitem').filter({ hasText: 'laptop' })
    await expect.element(row.getByText(/^Created /)).toBeVisible()
  })

  it('shows a new token once, with a copy button and a warning', async () => {
    let tokens = [LAPTOP]
    const requests = signedIn({
      'GET /api/tokens': { status: 200, body: () => tokens },
      'POST /api/tokens': {
        status: 201,
        body: () => {
          tokens = [LAPTOP, CI]
          return { id: CI.id, name: CI.name, token: SECRET }
        },
      },
    })
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { screen } = await renderApp('/account')

    await create(screen, ' ci ')

    await expect.element(screen.getByLabelText('New token')).toHaveValue(SECRET)
    await expect
      .element(screen.getByText('Copy it now: you will not see it again.'))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Copy token' }).click()
    expect(copy).toHaveBeenCalledWith(SECRET)
    await expect
      .element(screen.getByRole('button', { name: 'Copied' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('listitem').filter({ hasText: 'ci' }))
      .toBeVisible()
    const post = requests.find(
      (request) => routeOf(request) === 'POST /api/tokens'
    )
    expect(await post?.json()).toEqual({ name: 'ci' })

    await screen.getByRole('button', { name: 'Done' }).click()

    expect(screen.getByLabelText('New token').elements()).toHaveLength(0)
  })

  it('checks the name before calling the server', async () => {
    const requests = signedIn({ 'GET /api/tokens': { status: 200, body: [] } })
    const { screen } = await renderApp('/account')

    await expect.element(screen.getByText('No tokens yet.')).toBeVisible()
    await create(screen, '   ')

    await expect.element(screen.getByText('Enter a name.')).toBeVisible()
    await create(screen, 'x'.repeat(101))
    await expect
      .element(screen.getByText('Use at most 100 characters.'))
      .toBeVisible()
    expect(requests.map(routeOf)).not.toContain('POST /api/tokens')
  })

  it('puts server errors on the name or the form', async () => {
    let reply = {
      status: 422,
      body: problem(422, 'Check the highlighted fields.', [
        { field: 'name', message: 'must have 1 to 100 characters' },
      ]),
    }
    signedIn({
      'GET /api/tokens': { status: 200, body: [] },
      'POST /api/tokens': { status: 422, body: () => reply.body },
    })
    const { screen } = await renderApp('/account')

    await create(screen, 'x')
    await expect
      .element(screen.getByText('must have 1 to 100 characters'))
      .toBeVisible()

    reply = { status: 422, body: problem(422, 'Try again later.') }
    await create(screen, 'y')
    await expect.element(screen.getByText('Try again later.')).toBeVisible()
  })

  it('revokes a token after a confirmation', async () => {
    let tokens = [LAPTOP, CI]
    const requests = signedIn({
      'GET /api/tokens': { status: 200, body: () => tokens },
      'DELETE /api/tokens/3': {
        status: 204,
        body: () => {
          tokens = [CI]
          return undefined
        },
      },
    })
    const { screen } = await renderApp('/account')

    await screen.getByRole('button', { name: 'Revoke laptop' }).click()
    await screen.getByRole('button', { name: 'Cancel' }).click()
    expect(requests.map(routeOf)).not.toContain('DELETE /api/tokens/3')

    await screen.getByRole('button', { name: 'Revoke laptop' }).click()
    const confirm = screen.getByRole('alertdialog', { name: 'Revoke laptop?' })
    await expect
      .element(confirm.getByText(/stop working right away/))
      .toBeVisible()
    await confirm.getByRole('button', { name: 'Revoke token' }).click()

    await expect
      .poll(() => screen.getByRole('listitem').elements().length)
      .toBe(1)
    expect(requests.map(routeOf)).toContain('DELETE /api/tokens/3')
  })

  it('keeps the confirmation open when the revoke fails', async () => {
    signedIn({
      'GET /api/tokens': { status: 200, body: [LAPTOP] },
      'DELETE /api/tokens/3': {
        status: 404,
        body: problem(404, 'The resource was not found.'),
      },
    })
    const { screen } = await renderApp('/account')

    await screen.getByRole('button', { name: 'Revoke laptop' }).click()
    await screen.getByRole('button', { name: 'Revoke token' }).click()

    const confirm = screen.getByRole('alertdialog', { name: 'Revoke laptop?' })
    await expect
      .element(confirm.getByText('The resource was not found.'))
      .toBeVisible()
  })

  it("dates a token in the account's time zone", async () => {
    signedIn({
      'GET /api/me': {
        status: 200,
        body: { ...ALICE, time_zone: 'Pacific/Auckland' },
      },
      'GET /api/tokens': { status: 200, body: [LAPTOP] },
    })
    const { screen } = await renderApp('/account')

    const row = screen.getByRole('listitem').filter({ hasText: 'laptop' })
    await expect.element(row.getByText('Created Oct 2, 2026')).toBeVisible()
  })

  describe('display name', () => {
    const patches = (requests: Request[]) =>
      requests.filter((request) => routeOf(request) === 'PATCH /api/me')

    it('saves on blur and shows the new name in the account menu', async () => {
      let answer = (_: unknown) => {}
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'PATCH /api/me': {
          status: 200,
          body: { ...ALICE, display_name: 'Alice B' },
          until: new Promise((resolve) => (answer = resolve)),
        },
      })
      const { screen } = await renderApp('/account')
      const name = screen.getByLabelText('Name', { exact: true })

      await name.fill('Alice B')
      await userEvent.tab()
      await name.click()
      await userEvent.keyboard('{Enter}')
      answer(undefined)

      await expect.element(screen.getByText('Saved')).toBeVisible()
      await userEvent.keyboard('{Enter}')
      expect(patches(requests)).toHaveLength(1)
      expect(await patches(requests)[0]?.json()).toEqual({
        display_name: 'Alice B',
      })
      await screen.getByRole('button', { name: 'Account (Alice B)' }).click()
      await expect
        .element(screen.getByRole('menu').getByText('Alice B'))
        .toBeVisible()
    })

    it('checks the name before saving and puts it back on Escape', async () => {
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
      })
      const { screen } = await renderApp('/account')
      const name = screen.getByLabelText('Name', { exact: true })

      await name.fill('   ')
      await userEvent.keyboard('{Enter}')
      await expect.element(screen.getByText('Name is required.')).toBeVisible()
      await expect.element(name).toHaveAttribute('aria-invalid', 'true')

      await name.fill('x'.repeat(101))
      await userEvent.keyboard('{Enter}')
      await expect.element(screen.getByText('Name is too long.')).toBeVisible()
      await expect.element(screen.getByText('101/100')).toBeVisible()

      await userEvent.keyboard('{Escape}')
      await expect.element(name).toHaveValue('Alice')
      expect(screen.getByText('Name is too long.').elements()).toHaveLength(0)
      expect(patches(requests)).toHaveLength(0)
    })

    it('counts an emoji as one character, as the server does', async () => {
      const emoji = '🙂'.repeat(60)
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'PATCH /api/me': {
          status: 200,
          body: { ...ALICE, display_name: emoji },
        },
      })
      const { screen } = await renderApp('/account')

      await screen.getByLabelText('Name', { exact: true }).fill(emoji)
      await userEvent.keyboard('{Enter}')

      await expect.element(screen.getByText('Saved')).toBeVisible()
      expect(await patches(requests)[0]?.json()).toEqual({
        display_name: emoji,
      })
    })

    it('keeps the text and says so when the save fails', async () => {
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'PATCH /api/me': { status: 500, body: problem(500, 'Boom.') },
      })
      const { screen } = await renderApp('/account')
      const name = screen.getByLabelText('Name', { exact: true })

      await name.fill('Alice B')
      await userEvent.keyboard('{Enter}')

      await expect
        .element(screen.getByText('Could not save your name.'))
        .toBeVisible()
      await expect.element(name).toHaveValue('Alice B')
      await expect.element(name).toHaveFocus()
      expect(screen.getByText('Boom.').elements()).toHaveLength(0)
    })
  })

  describe('time zone', () => {
    const BROWSER = 'Browser time zone (America/New_York)'
    const patchOf = (requests: Request[]) =>
      requests.find((request) => routeOf(request) === 'PATCH /api/me')

    it('finds a zone by typing and saves it', async () => {
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'PATCH /api/me': {
          status: 200,
          body: { ...ALICE, time_zone: 'Pacific/Auckland' },
        },
      })
      const { screen } = await renderApp('/account')
      const trigger = screen.getByRole('button', { name: 'Time zone' })
      await expect.element(trigger).toHaveTextContent(BROWSER)

      await trigger.click()
      const search = screen.getByRole('combobox', { name: 'Find a time zone' })
      await search.fill('new york')
      await expect
        .element(
          screen.getByRole('option', { name: 'America/New_York', exact: true })
        )
        .toBeVisible()
      await search.fill('zzz')
      await expect
        .element(screen.getByText('No time zone matches.'))
        .toBeVisible()
      await search.fill('auck')
      await screen.getByRole('option', { name: 'Pacific/Auckland' }).click()

      await expect.element(trigger).toHaveTextContent('Pacific/Auckland')
      expect(await patchOf(requests)?.json()).toEqual({
        time_zone: 'Pacific/Auckland',
      })
      await expect.element(screen.getByText('Saved')).toBeVisible()
    })

    it('goes back to the browser zone as no zone at all', async () => {
      const requests = signedIn({
        'GET /api/me': {
          status: 200,
          body: { ...ALICE, time_zone: 'Pacific/Auckland' },
        },
        'GET /api/tokens': { status: 200, body: [] },
        'PATCH /api/me': { status: 200, body: ALICE },
      })
      const { screen } = await renderApp('/account')
      const trigger = screen.getByRole('button', { name: 'Time zone' })
      await expect.element(trigger).toHaveTextContent('Pacific/Auckland')

      await trigger.click()
      await screen.getByRole('option', { name: BROWSER }).click()

      await expect.element(trigger).toHaveTextContent(BROWSER)
      expect(await patchOf(requests)?.json()).toEqual({ time_zone: null })
    })

    it('puts the saved zone back and says so when the save fails', async () => {
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'PATCH /api/me': { status: 500, body: problem(500, 'Boom.') },
      })
      const { screen } = await renderApp('/account')
      const trigger = screen.getByRole('button', { name: 'Time zone' })

      await trigger.click()
      await screen
        .getByRole('combobox', { name: 'Find a time zone' })
        .fill('auck')
      await screen.getByRole('option', { name: 'Pacific/Auckland' }).click()

      await expect
        .element(screen.getByText('Could not save your time zone.'))
        .toBeVisible()
      await expect.element(trigger).toHaveTextContent(BROWSER)
      expect(screen.getByText('Boom.').elements()).toHaveLength(0)
    })

    it('offers only the browser zone where the zone list is missing', async () => {
      const list = Intl.supportedValuesOf
      Reflect.deleteProperty(Intl, 'supportedValuesOf')
      onTestFinished(() => {
        Intl.supportedValuesOf = list
      })
      signedIn({ 'GET /api/tokens': { status: 200, body: [] } })
      const { screen } = await renderApp('/account')

      await screen.getByRole('button', { name: 'Time zone' }).click()

      await expect
        .element(screen.getByRole('option', { name: BROWSER }))
        .toBeVisible()
      expect(screen.getByRole('option').elements()).toHaveLength(1)
    })
  })

  describe('theme', () => {
    const theme = () => document.documentElement.dataset.theme

    it('applies a choice at once and saves it', async () => {
      onTestFinished(() => applyTheme('system'))
      let answer = (_: unknown) => {}
      const requests = signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'PATCH /api/me': {
          status: 200,
          body: { ...ALICE, theme: 'dark' },
          until: new Promise((resolve) => (answer = resolve)),
        },
      })
      const { screen } = await renderApp('/account')
      const control = screen.getByRole('radiogroup', { name: 'Theme' })
      await expect
        .element(control.getByRole('radio', { name: 'System' }))
        .toBeChecked()

      await control.getByRole('radio', { name: 'Dark' }).click()

      expect(theme()).toBe('dark')
      const patch = requests.find(
        (request) => routeOf(request) === 'PATCH /api/me'
      )
      expect(await patch?.json()).toEqual({ theme: 'dark' })
      answer(undefined)
      await expect.element(screen.getByText('Saved')).toBeVisible()
      await expect
        .element(control.getByRole('radio', { name: 'Dark' }))
        .toBeChecked()
    })

    it('reverts and says so when the save fails', async () => {
      onTestFinished(() => applyTheme('system'))
      signedIn({
        'GET /api/tokens': { status: 200, body: [] },
        'PATCH /api/me': { status: 500, body: problem(500, 'Boom.') },
      })
      const { screen } = await renderApp('/account')
      const control = screen.getByRole('radiogroup', { name: 'Theme' })

      await control.getByRole('radio', { name: 'Dark' }).click()

      await expect
        .element(screen.getByText('Could not save your theme.'))
        .toBeVisible()
      expect(theme()).toBe('light')
      await expect
        .element(control.getByRole('radio', { name: 'System' }))
        .toBeChecked()
      expect(screen.getByText('Boom.').elements()).toHaveLength(0)
    })
  })
})
