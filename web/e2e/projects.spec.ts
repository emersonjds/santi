import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

const register = async (page: Page, name: string, email: string) => {
  await page.goto('/app/register')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: `Hi, ${name}` })).toBeVisible()
}

test('create a scrum project, invite a teammate, and they join through the link', async ({
  page,
  browser,
}) => {
  const key = `E${unique().slice(-6).toUpperCase()}`
  const name = `Launch ${key}`
  await register(page, 'Ada', `e2e-${unique()}@example.com`)

  await page
    .getByRole('main')
    .getByRole('link', { name: 'New project' })
    .click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Key').fill(key)
  await page.getByRole('button', { name: 'Create project' }).click()

  await expect(page).toHaveURL(new RegExp(`/app/p/${key}/backlog$`))
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Backlog' })).toBeVisible()

  await page.getByRole('button', { name: 'Invite' }).click()
  await page.getByRole('button', { name: 'Create invite link' }).click()
  const link = await page
    .getByRole('textbox', { name: 'Invite link' })
    .inputValue()
  expect(link).toMatch(/\/app\/invites\/[\w-]+$/)

  const teammate = await (await browser.newContext()).newPage()
  const graceEmail = `e2e-${unique()}@example.com`
  await register(teammate, 'Grace', graceEmail)
  await teammate.getByRole('button', { name: 'Account' }).click()
  await teammate.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(teammate.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await teammate.goto(link)
  await expect(teammate).toHaveURL(/\/app\/login\?redirect=/)
  await teammate.getByLabel('Email').fill(graceEmail)
  await teammate.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await teammate.getByRole('button', { name: 'Sign in' }).click()
  await teammate.getByRole('button', { name: 'Join project' }).click()

  await expect(teammate).toHaveURL(new RegExp(`/app/p/${key}/board$`))
  await expect(teammate.getByRole('heading', { name })).toBeVisible()
  await expect(
    teammate.getByRole('button', { name: 'Invite' })
  ).not.toBeVisible()
  await teammate.getByRole('button', { name: 'Members: 2' }).click()
  await expect(teammate.getByRole('dialog')).toContainText('Grace')
})

test('a signed-in user opening sign in goes home', async ({ page }) => {
  await register(page, 'Linus', `e2e-${unique()}@example.com`)

  await page.goto('/app/login')

  await expect(page.getByRole('heading', { name: 'Hi, Linus' })).toBeVisible()
})
