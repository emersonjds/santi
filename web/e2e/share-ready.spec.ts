import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

const register = async (page: Page, email: string) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Sam')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Hi, Sam' })).toBeVisible()
}

test('the sample project opens a running sprint, and a second click reopens it', async ({
  page,
}) => {
  await register(page, uniqueEmail())

  await page
    .getByRole('button', { name: 'Start with a sample project' })
    .click()

  await expect(page).toHaveURL(/\/p\/MOB[0-9A-Z]+\/board$/)
  const board = page.url()
  await expect(
    page.getByText('Remember the last signed-in account')
  ).toBeVisible()
  await page.goto('/projects/new')
  await page
    .getByRole('button', { name: 'Start with a sample project' })
    .click()
  await expect(page).toHaveURL(board)
})

test('repeated wrong passwords lock the email with a wait, account or not', async ({
  page,
}) => {
  const email = uniqueEmail()
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('not the password')
  for (let attempt = 0; attempt < 5; attempt++) {
    const answer = page.waitForResponse('**/api/auth/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    expect((await answer).status()).toBe(401)
  }

  const locked = page.waitForResponse('**/api/auth/login')
  await page.getByRole('button', { name: 'Sign in' }).click()

  const response = await locked
  expect(response.status()).toBe(429)
  expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0)
  await expect(page.getByRole('alert')).toContainText('Try again in')
})

test('the privacy note is linked from sign-up and the landing footer', async ({
  page,
}) => {
  await page.goto('/register')
  await page.getByRole('link', { name: 'privacy note' }).click()

  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible()
  await expect(page.getByText('No tracking, no analytics')).toBeVisible()

  await page.goto('/about')
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Privacy' })
    .click()
  await expect(page).toHaveURL(/\/privacy$/)
})
