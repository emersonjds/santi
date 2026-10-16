import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { signedIn, stubApi } from '@/test/stub-api'

const FEEDBACK = 'https://github.com/emersonjds/santi/issues/new/choose'

describe('feedback, privacy and terms links', () => {
  it('sends feedback to the issue templates from the account menu', async () => {
    signedIn()
    const { screen } = await renderApp('/')

    await screen.getByRole('button', { name: 'Account' }).click()

    await expect
      .element(screen.getByRole('menuitem', { name: 'Send feedback' }))
      .toHaveAttribute('href', FEEDBACK)
  })

  it('links privacy, terms and feedback at the foot of the sidebar', async () => {
    await page.viewport(1280, 800)
    signedIn()
    const { screen } = await renderApp('/')
    const links = screen.getByRole('navigation', { name: 'About santi' })

    await expect
      .element(links.getByRole('link', { name: 'Privacy' }))
      .toHaveAttribute('href', '/privacy')
    await expect
      .element(links.getByRole('link', { name: 'Terms' }))
      .toHaveAttribute('href', '/terms')
    await expect
      .element(links.getByRole('link', { name: 'Feedback' }))
      .toHaveAttribute('href', FEEDBACK)
  })

  it('drops privacy and terms when the instance has no legal pages', async () => {
    await page.viewport(1280, 800)
    signedIn({
      'GET /api/legal': {
        status: 200,
        body: { required: false, terms_version: 'x', privacy_version: 'x' },
      },
      'GET /api/tokens': { status: 200, body: [] },
    })
    const { screen } = await renderApp('/account')
    const links = screen.getByRole('navigation', { name: 'About santi' })

    await expect
      .element(links.getByRole('link', { name: 'Feedback' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('heading', { name: 'Your data' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: /Privacy/ }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Terms' }))
      .not.toBeInTheDocument()
  })

  it('links the privacy policy under the sign-up form', async () => {
    stubApi({ 'GET /api/me': { status: 401, body: {} } })
    const { screen } = await renderApp('/register')

    await expect
      .element(screen.getByRole('link', { name: 'Read our privacy policy' }))
      .toHaveAttribute('href', '/privacy')
  })
})
