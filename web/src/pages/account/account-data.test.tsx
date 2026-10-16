import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { ALICE, problem, routeOf, signedIn } from '@/test/stub-api'

const EXPORT = {
  exported_at: '2026-10-16T12:00:00Z',
  user: ALICE,
  terms_version: '2026-10-16',
  terms_accepted_at: '2026-10-16T11:00:00Z',
  api_tokens: [],
  projects: [],
  other_projects: [],
}

describe('your data', () => {
  it('downloads the account export as a JSON file', async () => {
    const requests = signedIn({
      'GET /api/tokens': { status: 200, body: [] },
      'GET /api/me/export': { status: 200, body: EXPORT },
    })
    const objectUrl = vi.spyOn(URL, 'createObjectURL')
    const { screen } = await renderApp('/account')

    await screen.getByRole('button', { name: 'Export my data' }).click()

    await expect.poll(() => objectUrl.mock.calls.length).toBe(1)
    const file = objectUrl.mock.calls[0][0] as Blob
    expect(file.type).toBe('application/json')
    expect(JSON.parse(await file.text())).toEqual(EXPORT)
    expect(requests.map(routeOf)).toContain('GET /api/me/export')
  })

  it('says why the export failed', async () => {
    signedIn({
      'GET /api/tokens': { status: 200, body: [] },
      'GET /api/me/export': { status: 500, body: problem(500, 'Boom.') },
    })
    const { screen } = await renderApp('/account')

    await screen.getByRole('button', { name: 'Export my data' }).click()

    await expect.element(screen.getByText('Boom.')).toBeVisible()
  })

  it('deletes the account after the password and explains what happens to projects', async () => {
    let reply: { status: number; body?: unknown } = {
      status: 422,
      body: problem(422, 'Check the highlighted fields.', [
        { field: 'password', message: 'does not match your password' },
      ]),
    }
    const requests = signedIn({
      'GET /api/tokens': { status: 200, body: [] },
      'DELETE /api/me': {
        get status() {
          return reply.status
        },
        get body() {
          return reply.body
        },
      },
    })
    const { screen, router } = await renderApp('/account')

    await screen.getByRole('button', { name: 'Delete my account' }).click()
    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete your account?',
    })
    await expect
      .element(confirm.getByText(/the member with the oldest account/))
      .toBeVisible()
    await confirm.getByLabelText('Password').fill('wrong password')
    await confirm.getByRole('button', { name: 'Delete account' }).click()
    await expect
      .element(confirm.getByText('does not match your password'))
      .toBeVisible()

    reply = { status: 204, body: undefined }
    await confirm.getByLabelText('Password').fill('correct horse battery')
    await confirm.getByRole('button', { name: 'Delete account' }).click()

    await expect.poll(() => router.state.location.pathname).toBe('/login')
    const deletes = requests.filter((request) => request.method === 'DELETE')
    expect(await deletes.at(-1)?.json()).toEqual({
      password: 'correct horse battery',
    })
  })
})
