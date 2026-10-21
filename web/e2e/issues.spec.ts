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
  await expect(
    page.getByRole('button', { name: 'Account (Ada)' })
  ).toBeVisible()
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

test('labels are picked from a list, saved at once and shown on the card', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  const patched = () =>
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/issues/1') &&
        response.request().method() === 'PATCH'
    )

  await page.getByRole('link', { name: 'Alpha task' }).click()
  const dialog = page.getByRole('dialog', { name: `${key}-1` })
  await dialog.getByRole('button', { name: 'Add label' }).click()
  for (const typed of ['bug', 'Release']) {
    const saved = patched()
    await page.keyboard.type(typed)
    await page.keyboard.press('Enter')
    expect((await saved).status()).toBe(200)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(
    dialog.getByRole('button', { name: 'Remove label Release' })
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  const card = column(page, 'To Do').getByRole('article').first()
  await expect(card.getByTitle('bug', { exact: true })).toBeVisible()
  await expect(card.getByTitle('Release', { exact: true })).toBeVisible()
  await page.reload()
  await expect(card.getByTitle('Release', { exact: true })).toBeVisible()
})

test('a comment is posted, edited and deleted, and each change survives a reload', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  await page.goto(`/p/${key}/issues/2`)
  const comments = page.getByRole('region', { name: 'Comments' })
  const comment = comments.getByRole('article')

  await comments.getByRole('button', { name: 'Add a comment…' }).click()
  // Same swap as in attachments.spec.ts: wait for the editor, not the textarea it replaces.
  await expect(
    comments.locator('.cm-content[aria-label="Add a comment"]')
  ).toBeFocused()
  await page.keyboard.type('Ready for review.')
  const posted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/comments')
  )
  await comments.getByRole('button', { name: 'Save' }).click()
  await expect(comment).toContainText('Ready for review.')
  await expect(comment).toContainText('Ada')
  expect((await posted).ok()).toBe(true)

  await comment.hover()
  await comment.getByRole('button', { name: 'Comment actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(
    comments.getByRole('textbox', { name: 'Edit comment' })
  ).toBeFocused()
  await page.keyboard.type(' Merged.')
  const edited = page.waitForResponse(
    (response) => response.request().method() === 'PATCH'
  )
  await comments.getByRole('button', { name: 'Save' }).click()
  await expect(comment).toContainText('Ready for review. Merged.')
  expect((await edited).ok()).toBe(true)
  await page.reload()
  await expect(comment.getByText('(edited)')).toBeVisible()

  await comment.hover()
  await comment.getByRole('button', { name: 'Comment actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const deleted = page.waitForResponse(
    (response) => response.request().method() === 'DELETE'
  )
  await page
    .getByRole('alertdialog', { name: 'Delete this comment?' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(comment).toHaveCount(0)
  expect((await deleted).ok()).toBe(true)
  await page.reload()
  await expect(comments.getByText('No comments yet.')).toBeVisible()
  await expect(comment).toHaveCount(0)
})

test('a copied comment link opens the issue at that comment, highlighted', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const key = await kanbanWithIssues(page)
  for (let note = 1; note <= 12; note++)
    await api(page, 'POST', `/api/projects/${key}/issues/1/comments`, {
      body: `Note ${note}`,
    })
  await page.goto(`/p/${key}/issues/1`)
  const target = page
    .getByRole('region', { name: 'Comments' })
    .getByRole('listitem')
    .filter({ hasText: 'Note 12' })

  await target.hover()
  await target.getByRole('button', { name: 'Comment actions' }).click()
  await page.getByRole('menuitem', { name: 'Copy link' }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(new RegExp(`/p/${key}/issues/1#comment-\\d+$`))

  await page.goto('/')
  await page.goto(link)
  await expect(target).toBeInViewport()
  await expect(target).toHaveClass(/bg-muted/)
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
