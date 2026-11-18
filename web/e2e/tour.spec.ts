import { expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

test('a new account sees the welcome tour once and can replay it from the menu', async ({
  page,
}) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page
    .getByLabel('Email')
    .fill(
      `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
    )
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()

  const tour = page.getByRole('dialog', { name: 'Welcome to santi' })
  await expect(tour).toBeVisible()
  await expect(tour.getByRole('status')).toHaveText('Step 1 of 5')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/me') &&
      response.request().method() === 'PATCH'
  )
  await tour.getByRole('button', { name: 'Skip tour' }).click()
  await expect(tour).toBeHidden()
  expect((await saved).ok()).toBe(true)

  await page.reload()
  const account = page.getByRole('button', { name: 'Account (Ada)' })
  await expect(account).toBeEnabled()
  await expect(
    page.getByRole('heading', { name: 'No projects yet' })
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await account.click()
  await page.getByRole('menuitem', { name: 'Take the tour' }).click()
  await expect(tour).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tour).toBeHidden()
  await expect(account).toBeFocused()
})
