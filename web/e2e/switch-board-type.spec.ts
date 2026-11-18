import { type Page, expect, test } from './fixtures'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

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

const switchTo = async (page: Page, type: 'Scrum' | 'Kanban') => {
  await page
    .getByRole('group', { name: 'Board type' })
    .getByRole('button', { name: type })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: `Switch to ${type}` })
    .click()
  await expect(page.getByText(`Switched to ${type}.`)).toBeVisible()
}

test('an admin switches a Scrum project to Kanban and back; sprints wait meanwhile (SAN-224)', async ({
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
  const key = `T${unique().slice(-6).toUpperCase()}`
  await api(page, 'POST', '/api/projects', {
    key,
    name: `Switch ${key}`,
    board_type: 'scrum',
  })
  const sprint = await api<{ id: number }>(
    page,
    'POST',
    `/api/projects/${key}/sprints`,
    {}
  )
  await api(page, 'POST', `/api/projects/${key}/issues`, {
    summary: 'Planned work',
    sprint_id: sprint.id,
  })
  await api(page, 'POST', `/api/projects/${key}/issues`, {
    summary: 'Waiting work',
  })
  const now = Date.now()
  await api(page, 'POST', `/api/projects/${key}/sprints/${sprint.id}/start`, {
    starts_at: new Date(now).toISOString(),
    ends_at: new Date(now + 3_600_000).toISOString(),
  })

  const views = page.getByRole('navigation', { name: 'Project views' })
  const sprintMenu = page.getByRole('button', { name: 'More for Sprint 1' })
  const waiting = page.getByRole('link', { name: 'Waiting work' })

  await page.goto(`/p/${key}/settings`)
  await switchTo(page, 'Kanban')
  await expect(views.getByRole('link', { name: 'Reports' })).toHaveCount(0)
  await views.getByRole('link', { name: 'Board' }).click()
  await expect(waiting).toBeVisible()
  await expect(page.getByRole('link', { name: 'Planned work' })).toBeVisible()
  await expect(sprintMenu).toHaveCount(0)

  await page.goto(`/p/${key}/backlog`)
  await expect(page).toHaveURL(new RegExp(`/p/${key}/board$`))

  await views.getByRole('link', { name: 'Settings' }).click()
  await switchTo(page, 'Scrum')
  await expect(views.getByRole('link', { name: 'Reports' })).toBeVisible()
  await views.getByRole('link', { name: 'Board' }).click()
  await expect(sprintMenu).toBeVisible()
  await expect(page.getByRole('link', { name: 'Planned work' })).toBeVisible()
  await expect(waiting).toHaveCount(0)
})
