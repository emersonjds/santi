import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
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
  it('opens from the account menu with the profile read only', async () => {
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
