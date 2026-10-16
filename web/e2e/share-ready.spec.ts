import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

const register = async (page: Page, email: string) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Sam')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
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

test('the privacy policy and terms are linked from sign-up and the landing', async ({
  page,
}) => {
  await page.goto('/register')
  await page.getByRole('link', { name: 'Read our privacy policy' }).click()

  await expect(
    page.getByRole('heading', { name: 'Privacy Policy', level: 1 })
  ).toBeVisible()
  await expect(
    page.getByText('No ads, no tracking, no analytics')
  ).toBeVisible()

  await page.goto('/about')
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Terms of Use' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Terms of Use', level: 1 })
  ).toBeVisible()
  await expect(page.getByText('not legal advice').first()).toBeVisible()
})

test('a new user exports their data and deletes their account', async ({
  page,
}) => {
  const email = uniqueEmail()
  await register(page, email)
  await page.goto('/account')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export my data' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^santi-export-.*\.json$/)

  await page.getByRole('button', { name: 'Delete my account' }).click()
  const confirm = page.getByRole('alertdialog')
  await confirm.getByLabel('Password').fill(PASSWORD)
  await confirm.getByRole('button', { name: 'Delete account' }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
})
