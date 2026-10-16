import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

const register = async (page: Page) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
}

const dangerZone = (page: Page) =>
  page.getByRole('region', { name: 'Danger zone' })

test('archive is read-only until unarchived; trash leaves the sidebar until restored', async ({
  page,
}) => {
  const key = `L${unique().slice(-6).toUpperCase()}`
  const name = `Lifecycle ${key}`
  await register(page)
  await page
    .getByRole('main')
    .getByRole('link', { name: 'New project' })
    .click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Key').fill(key)
  await page.getByRole('radio', { name: /Kanban/ }).check()
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page).toHaveURL(new RegExp(`/p/${key}/board$`))
  const sidebar = page.getByRole('navigation', { name: 'Projects and pages' })
  const inSidebar = sidebar.getByRole('link', { name: new RegExp(name) })

  await page.goto(`/p/${key}/settings`)
  await dangerZone(page).getByRole('button', { name: 'Archive' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Archive project' })
    .click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByText(`Archived ${key}`)).toBeVisible()
  await expect(inSidebar).toHaveCount(0)

  await page.goto(`/p/${key}/board`)
  const banner = page
    .getByRole('status')
    .filter({ hasText: 'This project is archived and read-only' })
  await expect(banner).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Create issue' }).first()
  ).toHaveAttribute('aria-disabled', 'true')
  await banner.getByRole('button', { name: 'Unarchive' }).click()
  await expect(banner).toHaveCount(0)
  await expect(inSidebar).toBeVisible()

  await page.goto(`/p/${key}/settings`)
  await dangerZone(page).getByRole('button', { name: 'Delete project' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByLabel(`Type ${key} to confirm`).fill(key)
  await dialog.getByRole('button', { name: 'Delete project' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByText(`Moved ${key} to trash`)).toBeVisible()
  await expect(inSidebar).toHaveCount(0)

  await page
    .getByRole('tablist', { name: 'Projects by state' })
    .getByRole('tab', { name: 'Trash' })
    .click()
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText(
    '60 days'
  )
  await page.getByRole('button', { name: `Restore ${name}` }).click()
  await expect(page.getByText('Nothing in the trash')).toBeVisible()
  await expect(inSidebar).toBeVisible()
})
