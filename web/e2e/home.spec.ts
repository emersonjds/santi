import { type Page, expect, test } from '@playwright/test'

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
      return response.status === 204 ? null : response.json()
    },
    { method, path, body }
  )

test('the home lists assigned, starred, worked on and viewed issues across projects', async ({
  page,
}) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Account (Ada)' })
  ).toBeVisible()

  const suffix = unique().slice(-5).toUpperCase()
  const [web, ops] = [`W${suffix}`, `O${suffix}`]
  const me = await api(page, 'GET', '/api/me')
  await api(page, 'POST', '/api/projects', {
    key: web,
    name: `Web ${suffix}`,
    board_type: 'scrum',
  })
  await api(page, 'POST', '/api/projects', {
    key: ops,
    name: `Ops ${suffix}`,
    board_type: 'kanban',
  })
  await api(page, 'POST', `/api/projects/${web}/issues`, {
    summary: 'Ship the login page',
    assignee_id: me.id,
  })
  await api(page, 'POST', `/api/projects/${web}/issues`, {
    summary: 'Write the changelog',
  })
  await api(page, 'POST', `/api/projects/${ops}/issues`, {
    summary: 'Rotate the keys',
  })
  await page.goto(`/p/${ops}/issues/1`)
  await expect(page.getByLabel('Summary')).toHaveValue('Rotate the keys')

  await page.getByRole('link', { name: 'For you' }).first().click()
  const cards = page.getByRole('region', { name: 'Recommended projects' })
  await expect(cards.getByRole('link', { name: `Ops ${suffix}` })).toBeVisible()
  await expect(cards.getByRole('link', { name: `Web ${suffix}` })).toBeVisible()
  await expect(cards.getByRole('listitem').first()).toContainText(
    `Ops ${suffix}`
  )

  const panel = page.getByRole('tabpanel')
  await page.getByRole('tab', { name: 'Assigned to me 1' }).click()
  await expect(page).toHaveURL(/\?tab=assigned$/)
  await expect(panel.getByRole('link')).toHaveText(['Ship the login page'])

  await page.getByRole('tab', { name: 'Worked on' }).click()
  await expect(panel.getByRole('link')).toHaveText([
    'Rotate the keys',
    'Write the changelog',
    'Ship the login page',
  ])
  await expect(panel).toContainText(`Story • ${web}-2 • Web ${suffix}`)
  await panel.getByRole('button', { name: `Star ${web}-2` }).click()
  await expect(
    panel.getByRole('button', { name: `Star ${web}-2` })
  ).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('tab', { name: 'Starred' }).click()
  await expect(panel.getByRole('link')).toHaveText(['Write the changelog'])

  await page.getByRole('tab', { name: 'Viewed' }).click()
  await expect(panel.getByRole('link')).toHaveText(['Rotate the keys'])
  await expect(panel.getByRole('heading', { name: 'Today' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Viewed' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.getByRole('link', { name: 'View all projects' }).click()
  await expect(
    page.getByRole('heading', { name: 'Projects', level: 1 })
  ).toBeVisible()
  const table = page.getByRole('table')
  await expect(table.getByRole('row')).toHaveCount(3)
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/me/stars')
    ),
    table.getByRole('button', { name: `Star Web ${suffix}` }).click(),
  ])
  await page.reload()
  await expect(
    table.getByRole('button', { name: `Star Web ${suffix}` })
  ).toHaveAttribute('aria-pressed', 'true')
})
