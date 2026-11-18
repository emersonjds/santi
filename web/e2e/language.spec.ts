import { expect, test } from './fixtures'

const PASSWORD = 'correct horse battery'

test('a saved language is on the page before the app first renders', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const me = await page.evaluate(() => fetch('/api/me').then((r) => r.json()))
  expect(me.language).toBe('en')

  const saved = await page.evaluate(() =>
    fetch('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'pt-BR' }),
    }).then((r) => r.status)
  )
  expect(saved).toBe(200)
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      const root = document.getElementById('root')
      if (!root?.firstChild) return
      observer.disconnect()
      document.documentElement.dataset.langAtRender =
        document.documentElement.lang
    }).observe(document, { childList: true, subtree: true })
  })

  await page.goto('/account')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Conta' })
  ).toBeVisible()
  const root = page.locator('html')
  await expect(root).toHaveAttribute('lang', 'pt-BR')

  await page.reload()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Conta' })
  ).toBeVisible()
  await expect(root).toHaveAttribute('data-lang-at-render', 'pt-BR')
})
