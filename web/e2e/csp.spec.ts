import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** Every CSP report and console complaint of the page, collected while it runs. */
const violationsOf = (page: Page) => {
  const seen: string[] = []
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text()))
      seen.push(message.text())
  })
  page.on('pageerror', (error) => seen.push(error.message))
  return seen
}

test('the SPA runs under its Content-Security-Policy', async ({ page }) => {
  const violations = violationsOf(page)
  const response = await page.goto('/register')
  expect(response?.headers()['content-security-policy']).toContain(
    "script-src 'self'"
  )
  expect(response?.headers()['x-content-type-options']).toBe('nosniff')

  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Account (Ada)' })
  ).toBeVisible()

  const key = `C${unique().slice(-6).toUpperCase()}`
  await page.evaluate(
    (key) =>
      fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, name: `CSP ${key}`, board_type: 'scrum' }),
      }),
    key
  )
  await page.goto(`/p/${key}/backlog`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Create issue' })
  await dialog.getByLabel('Summary').fill('Under the policy')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  // A toast and a dialog's scroll lock both add style tags at runtime.
  await expect(page.getByText(`${key}-1 created`)).toBeVisible()
  await expect(page.getByText('Under the policy')).toBeVisible()
  await page.goto(`/p/${key}/board`)
  await expect(page.getByRole('heading', { name: `CSP ${key}` })).toBeVisible()

  expect(violations).toEqual([])
})
