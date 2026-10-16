import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** Calls the API from inside the page, so the session cookie and same-origin checks apply as for the SPA. */
const api = (page: Page, path: string, body: unknown) =>
  page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`POST ${path}: ${response.status}`)
    },
    { path, body }
  )

test('the top bar search finds an issue and opens it over the results', async ({
  page,
}) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Hi, Ada' })).toBeVisible()
  const key = `S${unique().slice(-6).toUpperCase()}`
  await api(page, '/api/projects', {
    key,
    name: `Find ${key}`,
    board_type: 'kanban',
  })
  for (const summary of ['Alpha task', 'Beta rollout'])
    await api(page, `/api/projects/${key}/issues`, { summary })
  await page.goto(`/p/${key}/board`)

  const search = page.getByRole('searchbox', { name: `Search ${key}` })
  await search.fill('rollout')
  await search.press('Enter')

  await expect(page).toHaveURL(new RegExp(`/p/${key}/search\\?q=rollout$`))
  await expect(page.getByRole('link', { name: 'Beta rollout' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Alpha task' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Beta rollout' }).click()

  const dialog = page.getByRole('dialog', { name: `${key}-2` })
  await expect(dialog.getByLabel('Summary')).toHaveValue('Beta rollout')
  await expect(page).toHaveURL(new RegExp(`/p/${key}/issues/2$`))
})
