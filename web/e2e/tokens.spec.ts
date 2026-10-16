import { expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

test('an API token signs in a client until it is revoked', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Hi, Ada' })).toBeVisible()

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'API tokens' }).click()
  await page.getByLabel('Token name').fill('cli')
  await page.getByRole('button', { name: 'Create token' }).click()
  const token = await page.getByLabel('New token').inputValue()
  expect(token).toMatch(/^santi_/)

  // `request` shares no cookie with the page: only the bearer token signs it in.
  const me = () =>
    request.get('/api/me', { headers: { authorization: `Bearer ${token}` } })
  const signedIn = await me()
  expect(signedIn.status()).toBe(200)
  expect(await signedIn.json()).toMatchObject({ email })

  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Revoke cli' }).click()
  await page.getByRole('button', { name: 'Revoke token' }).click()
  await expect(page.getByText('No tokens yet.')).toBeVisible()

  expect((await me()).status()).toBe(401)
})
