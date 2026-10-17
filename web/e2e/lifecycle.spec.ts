import { type Locator, type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** Calls the API from inside the page, so the session cookie and same-origin checks apply as for the SPA. */
const api = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`)
    },
    { method, path, body }
  )

const dragWithMouse = async (page: Page, from: Locator, to: Locator) => {
  const start = await from.boundingBox()
  const end = await to.boundingBox()
  if (!start || !end) throw new Error('nothing to drag')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + 40, { steps: 12 })
  await page.mouse.up()
}

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

test('expands another project from its sidebar row and copies its link', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const keys = [0, 1].map(
    (index) => `S${index}${unique().slice(-5).toUpperCase()}`
  )
  await register(page)
  for (const key of keys) {
    await page.goto('/projects/new')
    await page.getByLabel('Name').fill(`Sidebar ${key}`)
    await page.getByLabel('Key').fill(key)
    await page.getByRole('radio', { name: /Kanban/ }).check()
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page).toHaveURL(new RegExp(`/p/${key}/board$`))
  }
  const sidebar = page.getByRole('navigation', { name: 'Projects and pages' })
  const other = `Sidebar ${keys[0]}`

  const chevron = sidebar.getByRole('button', { name: `Toggle ${other}` })
  await expect(chevron).toHaveAttribute('aria-expanded', 'false')
  await chevron.click()
  await expect(chevron).toHaveAttribute('aria-expanded', 'true')
  await expect(sidebar.locator(`a[href="/p/${keys[0]}/board"]`)).toBeVisible()

  await sidebar.getByRole('button', { name: `Actions for ${other}` }).click()
  await page.getByRole('menuitem', { name: 'Copy link' }).click()
  await expect(page.getByText(`Copied the link to ${keys[0]}`)).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    new URL(`/p/${keys[0]}`, page.url()).href
  )
})

test('an archived board neither drags nor edits until it is unarchived', async ({
  page,
}) => {
  await register(page)
  const key = `R${unique().slice(-6).toUpperCase()}`
  await api(page, 'POST', '/api/projects', {
    key,
    name: `Frozen ${key}`,
    board_type: 'kanban',
  })
  await api(page, 'POST', `/api/projects/${key}/issues`, {
    summary: 'Alpha task',
  })
  await api(page, 'POST', `/api/projects/${key}/archive`)
  const writes: string[] = []
  // Recording a view is a read the server keeps.
  page.on('request', (request) => {
    const url = request.url()
    if (
      request.method() !== 'GET' &&
      url.includes('/issues') &&
      !url.endsWith('/view')
    )
      writes.push(`${request.method()} ${url}`)
  })

  await page.goto(`/p/${key}/board`)
  const banner = page
    .getByRole('status')
    .filter({ hasText: 'This project is archived and read-only' })
  await expect(banner).toBeVisible()
  const todo = page.getByRole('region', { name: 'To Do', exact: true })
  const doing = page.getByRole('region', { name: 'In Progress', exact: true })
  await expect(todo).toContainText('Alpha task')
  await dragWithMouse(page, todo.getByText('Alpha task'), doing)
  await expect(todo).toContainText('Alpha task')
  await expect(doing).not.toContainText('Alpha task')

  await page.goto(`/p/${key}/issues/1`)
  const summary = page.getByRole('textbox', { name: 'Summary' })
  await expect(summary).toHaveValue('Alpha task')
  await expect(summary).toHaveAttribute('readonly', '')
  const edit = page.getByRole('button', { name: 'Edit description' })
  await expect(edit).toHaveAttribute('aria-disabled', 'true')
  await edit.click({ force: true })
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveCount(
    0
  )
  expect(writes).toEqual([])

  await banner.getByRole('button', { name: 'Unarchive' }).click()
  await expect(banner).toHaveCount(0)
  await expect(summary).not.toHaveAttribute('readonly')
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().endsWith(`/api/projects/${key}/issues/1`)
  )
  await summary.fill('Alpha task, thawed')
  await summary.press('Enter')
  expect((await saved).ok()).toBe(true)
  await page.reload()
  await expect(summary).toHaveValue('Alpha task, thawed')
})
