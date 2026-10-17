import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const SHOTS = process.env.SHOTS_DIR ?? 'test-results/reports-shots'

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
      return response.status === 204 ? null : response.json()
    },
    { method, path, body }
  ) as Promise<Body>

/** A signed-in user with an empty scrum project; returns its key. */
const scrumProject = async (page: Page) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  const key = `R${unique().slice(-6).toUpperCase()}`
  await api(page, 'POST', '/api/projects', {
    key,
    name: `Reports ${key}`,
    board_type: 'scrum',
  })
  return key
}

type Settings = {
  columns: { statuses: { id: number; category: string }[] }[]
}

const sprintWith = async (
  page: Page,
  key: string,
  goal: string,
  issues: { summary: string; points: number; status_id?: number }[]
) => {
  const sprint = await api<{ id: number }>(
    page,
    'POST',
    `/api/projects/${key}/sprints`,
    { goal }
  )
  for (const issue of issues)
    await api(page, 'POST', `/api/projects/${key}/issues`, {
      ...issue,
      sprint_id: sprint.id,
    })
  const today = new Date().toLocaleDateString('sv')
  await api(page, 'POST', `/api/projects/${key}/sprints/${sprint.id}/start`, {
    start_date: today,
    end_date: today,
  })
  return sprint.id
}

const shoot = async (page: Page, name: string) => {
  for (const theme of ['light', 'dark'])
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `${SHOTS}/${name}-${width}-${theme}.png`,
        fullPage: true,
      })
    }
}

test('the reports tab lists the running sprint first, then the completed one, with velocity', async ({
  page,
}) => {
  const key = await scrumProject(page)
  const settings = await api<Settings>(
    page,
    'GET',
    `/api/projects/${key}/board/settings`
  )
  const done = settings.columns
    .flatMap((column) => column.statuses)
    .find((status) => status.category === 'done')?.id
  const first = await sprintWith(page, key, 'Ship the sign-in flow', [
    { summary: 'Alpha task', points: 3, status_id: done },
    { summary: 'Beta task', points: 5 },
  ])
  await api(page, 'POST', `/api/projects/${key}/sprints/${first}/complete`, {
    open_issues: { to: 'backlog' },
  })
  await sprintWith(page, key, '', [{ summary: 'Gamma task', points: 2 }])

  await page.goto(`/p/${key}/board`)
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Reports' })
    .click()

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
  const rows = page
    .getByRole('region', { name: 'Sprints' })
    .getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Sprint 2')
  await expect(rows.first()).toContainText('In progress')
  await expect(rows.nth(1)).toContainText('Sprint 1')
  await expect(rows.nth(1)).toContainText('Ship the sign-in flow')
  await expect(rows.nth(1)).toContainText('Committed8')
  await expect(rows.nth(1)).toContainText('Completed3')
  await expect(page.getByText('Average 3')).toBeVisible()
  await shoot(page, 'reports-data')

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByText('View as table').click()
  const table = page.getByRole('table', { name: 'Velocity by sprint' })
  await expect(table.getByRole('row').nth(1)).toHaveText('Sprint 183')
  await expect(table.getByRole('row').last()).toHaveText('Average3')

  await rows.nth(1).getByRole('link', { name: 'Sprint 1' }).click()
  await expect(page).toHaveURL(new RegExp(`/p/${key}/reports/${first}$`))
  const title = page.getByRole('heading', { name: 'Sprint 1', level: 1 })
  await expect(title).toBeVisible()
  const completed = page.getByRole('region', { name: 'Completed', exact: true })
  await expect(completed.getByRole('listitem')).toContainText('Alpha task')
  await expect(completed).toContainText('3 → 3 points')
  await expect(
    page.getByRole('region', { name: 'Not completed' }).getByRole('listitem')
  ).toContainText('Beta task')
  await expect(
    page.getByRole('region', { name: 'Removed from sprint' })
  ).toContainText('No issues')
  await shoot(page, 'report-closed')

  await page.setViewportSize({ width: 1440, height: 900 })
  const next = page.getByRole('button', { name: 'Next sprint' })
  await next.click()
  await expect(
    page.getByRole('heading', { name: 'Sprint 2', level: 1 })
  ).toBeVisible()
  await expect(page.getByText('Updates as the sprint moves.')).toBeVisible()
  await expect(next).toHaveAttribute('aria-disabled', 'true')
  await expect(next).toBeFocused()
  await expect(
    page.getByRole('status').filter({ hasText: 'Now showing Sprint 2' })
  ).toBeAttached()
  await shoot(page, 'report-active')

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Previous sprint' }).click()
  await expect(title).toBeVisible()
  await completed.getByRole('link', { name: `${key}-1` }).click()
  await expect(page.getByRole('dialog', { name: `${key}-1` })).toBeVisible()
})

test('a project with no started sprint points to the backlog', async ({
  page,
}) => {
  const key = await scrumProject(page)
  await page.goto(`/p/${key}/reports`)

  const sprints = page.getByRole('region', { name: 'Sprints' })
  await expect(sprints).toContainText('No sprint has finished yet.')
  await expect(page.getByRole('region', { name: 'Velocity' })).toContainText(
    'No sprint has finished yet.'
  )
  await shoot(page, 'reports-empty')

  await sprints.getByRole('link', { name: 'Go to Backlog' }).click()
  await expect(page).toHaveURL(new RegExp(`/p/${key}/backlog$`))
})
