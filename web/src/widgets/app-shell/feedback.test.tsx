import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { signedIn, stubApi } from '@/test/stub-api'

describe('feedback and privacy links', () => {
  it('sends feedback to the issue templates from the account menu', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    await screen.getByRole('button', { name: 'Account' }).click()

    await expect
      .element(screen.getByRole('menuitem', { name: 'Send feedback' }))
      .toHaveAttribute(
        'href',
        'https://github.com/emersonjds/santi/issues/new/choose'
      )
  })

  it('links the privacy note from the sign-up page', async () => {
    stubApi({ 'GET /api/me': { status: 401, body: {} } })
    const { screen } = await renderApp('/register')

    await expect
      .element(screen.getByRole('link', { name: 'privacy note' }))
      .toHaveAttribute('href', '/privacy')
  })
})
