import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

const signIn = async (page: Page, email: string, password: string) => {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

const home = (page: Page) =>
  page.getByRole('heading', { name: 'No projects yet' })

test('register lands on the empty home', async ({ page }) => {
  await page.goto('/app/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(uniqueEmail())
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(home(page)).toBeVisible()
  await page.reload()
  await expect(home(page)).toBeVisible()
})

test('sign out, then sign back in', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/app/register')
  await page.getByLabel('Name').fill('Grace')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(home(page)).toBeVisible()

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.goto('/app/')
  await expect(page).toHaveURL(/\/app\/login\?redirect=/)

  await signIn(page, email, 'not the password')
  await expect(page.getByRole('alert')).toBeVisible()
  await signIn(page, email, PASSWORD)
  await expect(home(page)).toBeVisible()
})
