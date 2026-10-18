import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** Every CSP report and console complaint of the page, collected while it runs. */
const violationsOf = (page: Page) => {
  const seen: string[] = []
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text()))
      seen.push(message.text())
  })
  page.on('pageerror', (error) => seen.push(error.message))
  return seen
}

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

/** Ada, signed in, owning a project with one issue; returns the issue page path. */
const issueOfAda = async (page: Page, description = '') => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(
    page.getByRole('button', { name: 'Account (Ada)' })
  ).toBeVisible()
  const key = `R${unique().slice(-6).toUpperCase()}`
  await api(page, 'POST', '/api/projects', {
    key,
    name: `Rich ${key}`,
    board_type: 'kanban',
  })
  await api(page, 'POST', `/api/projects/${key}/issues`, {
    summary: 'Write it up',
    description,
  })
  return `/p/${key}/issues/1`
}

/** The CodeMirror surface, not the textarea it replaces once its chunk is in. */
const editorOf = (page: Page, label: string) =>
  page.locator(`.cm-content[aria-label="${label}"]`)

/** The mention list under the caret; the Assignee select also holds an "Ada" option. */
const picker = (page: Page) => page.getByRole('listbox')

test('a description written in the editor saves with Mod-Enter and renders as Markdown after a reload', async ({
  page,
}) => {
  const violations = violationsOf(page)
  await page.goto(await issueOfAda(page))

  await page.getByRole('button', { name: 'Edit description' }).click()
  const editor = editorOf(page, 'Description')
  await expect(editor).toBeFocused()
  await page.keyboard.type('Ship it ')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type('fast')
  await page.keyboard.press('End')
  await page.keyboard.type(' for @Ad')
  await expect(picker(page).getByRole('option', { name: /^Ada/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText(
    '| Step | Owner |\n| --- | --- |\n| Ship | Ada |'
  )

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      /\/issues\/1$/.test(response.url())
  )
  await page.keyboard.press('ControlOrMeta+Enter')
  expect((await saved).ok()).toBe(true)

  await page.reload()
  const description = page.getByRole('region', { name: 'Description' })
  await expect(description.locator('strong')).toHaveText('fast')
  await expect(description.locator('[data-mention]')).toContainText('@Ada')
  await expect(description.getByRole('listitem')).toHaveText(['one', 'two'])
  await expect(description.getByRole('cell', { name: 'Ship' })).toBeVisible()
  await expect(
    description.getByRole('columnheader', { name: 'Owner' })
  ).toBeVisible()
  expect(violations).toEqual([])
})

test('a comment mentions a member picked with the keyboard and posts with Mod-Enter', async ({
  page,
}) => {
  const violations = violationsOf(page)
  await page.goto(await issueOfAda(page))

  await page.getByLabel('Add a comment').click()
  const editor = editorOf(page, 'Add a comment')
  await expect(editor).toBeFocused()
  await page.keyboard.type('Over to @ad')
  await expect(picker(page).getByRole('option', { name: /^Ada/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.type(' now')
  await page.keyboard.press('ControlOrMeta+Enter')

  const comments = page.getByRole('region', { name: 'Comments' })
  const chip = comments.getByRole('article').locator('[data-mention]')
  await expect(chip).toContainText('@Ada')
  await page.reload()
  await expect(chip).toContainText('@Ada')
  await expect(comments.getByRole('article')).toContainText('now')
  expect(violations).toEqual([])
})

test('a script tag and a javascript: link in a body stay inert under the CSP', async ({
  page,
}) => {
  const violations = violationsOf(page)
  const path = await issueOfAda(
    page,
    '<script>window.pwned = 1</script>\n\n[run me](javascript:window.pwned=1)'
  )
  await page.goto(path)

  const description = page.getByRole('region', { name: 'Description' })
  await expect(description).toContainText('<script>window.pwned = 1</script>')
  await expect(description.getByText('run me')).toBeVisible()
  await expect(description.getByRole('link', { name: 'run me' })).toHaveCount(0)
  await description.getByText('run me').click()
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
  await expect(description.locator('script')).toHaveCount(0)
  expect(violations).toEqual([])
})

test('at 375 px the toolbar scrolls inside itself and the page never scrolls sideways', async ({
  page,
}) => {
  const violations = violationsOf(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(await issueOfAda(page))

  await page.getByRole('button', { name: 'Edit description' }).click()
  await expect(editorOf(page, 'Description')).toBeFocused()
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' })
  const sizes = await toolbar.evaluate((element) => ({
    overflow: getComputedStyle(element).overflowX,
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }))
  expect(sizes.overflow).toBe('auto')
  expect(sizes.scroll).toBeGreaterThan(sizes.client)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375
  )
  expect(violations).toEqual([])
})
