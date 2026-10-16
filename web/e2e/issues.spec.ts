import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** Calls the API from inside the page, so the session cookie and same-origin checks apply as for the SPA. */
const api = <Body>(page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`)
      return response.json()
    },
    { method, path, body }
  ) as Promise<Body>

const register = async (page: Page, name: string) => {
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
}

/** A signed-in user with a kanban project holding two issues in its first column. */
const kanbanWithIssues = async (page: Page) => {
  await page.goto('/register')
  await register(page, 'Ada')
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  const key = `I${unique().slice(-6).toUpperCase()}`
  await api(page, 'POST', '/api/projects', {
    key,
    name: `Flow ${key}`,
    board_type: 'kanban',
  })
  for (const summary of ['Alpha task', 'Beta task'])
    await api(page, 'POST', `/api/projects/${key}/issues`, { summary })
  await page.goto(`/p/${key}/board`)
  return key
}

const column = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true })

test('a card opens in a dialog; an edit shows on the card behind; a reload shows the full page', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)

  await page.getByRole('link', { name: 'Alpha task' }).click()
  const dialog = page.getByRole('dialog', { name: `${key}-1` })
  await expect(dialog.getByLabel('Summary')).toHaveValue('Alpha task')
  await expect(page).toHaveURL(new RegExp(`/p/${key}/issues/1$`))

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/issues/1`) &&
      response.request().method() === 'PATCH'
  )
  await dialog.getByLabel('Priority').selectOption('High')
  expect((await saved).status()).toBe(200)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`/p/${key}/board$`))
  await expect(
    column(page, 'To Do').getByRole('article').first()
  ).toContainText('High priority')

  await page.getByRole('link', { name: 'Alpha task' }).click()
  await expect(dialog).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Summary')).toHaveValue('Alpha task')
  await expect(page.getByLabel('Priority')).toHaveValue('high')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('c opens the create dialog and the new card lands on the board', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  await expect(column(page, 'To Do')).toContainText('Beta task')

  await page.getByRole('heading', { name: `Flow ${key}` }).click()
  await page.keyboard.press('c')
  const dialog = page.getByRole('dialog', { name: 'Create issue' })
  await expect(dialog.getByLabel('Project')).toHaveValue(key)
  await dialog.getByLabel('Summary').fill('Gamma task')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(dialog).toBeHidden()
  await expect(column(page, 'To Do')).toContainText('Gamma task')
  await expect(page.getByText(`${key}-3 created`)).toBeVisible()
  await page.reload()
  await expect(column(page, 'To Do')).toContainText('Gamma task')
})

test('a comment shows at once and stays after a reload', async ({ page }) => {
  const key = await kanbanWithIssues(page)
  await page.goto(`/p/${key}/issues/2`)

  await page.getByLabel('Add a comment').fill('Ready for review.')
  await page.getByRole('button', { name: 'Comment', exact: true }).click()

  const comments = page.getByRole('region', { name: 'Comments' })
  await expect(comments.getByRole('article')).toContainText('Ready for review.')
  await expect(comments.getByRole('article')).toContainText('Ada')
  await page.reload()
  await expect(comments.getByRole('article')).toContainText('Ready for review.')
})

test('an invited visitor previews the invite, creates an account and joins', async ({
  page,
  browser,
}) => {
  const key = await kanbanWithIssues(page)
  const invite = await api<{ token: string }>(
    page,
    'POST',
    `/api/projects/${key}/invites`,
    { role: 'member' }
  )

  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(`/invites/${invite.token}`)
  await visitor.getByRole('link', { name: 'Create an account' }).click()
  await register(visitor, 'Grace')

  const offer = visitor.getByRole('region', { name: 'Invite' })
  await expect(offer).toContainText(`Flow ${key}`)
  await expect(offer).toContainText('Ada')
  await visitor.getByRole('button', { name: 'Join project' }).click()

  await expect(
    visitor.getByRole('heading', { name: `Flow ${key}` })
  ).toBeVisible()
  await expect(visitor).toHaveURL(new RegExp(`/p/${key}/board$`))
})
