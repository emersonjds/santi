import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

const register = async (page: Page, name: string, email: string) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: `Account (${name})` })
  ).toBeVisible()
}

test('an admin adds a Review column with a WIP limit and maps a new status into it; a member gets only the danger zone', async ({
  page,
  browser,
}) => {
  const key = `S${unique().slice(-6).toUpperCase()}`
  await register(page, 'Ada', `e2e-${unique()}@example.com`)
  const teammate = await (await browser.newContext()).newPage()
  const graceEmail = `e2e-${unique()}@example.com`
  await register(teammate, 'Grace', graceEmail)
  const token = await page.evaluate(
    async ({ key }) => {
      const post = (path: string, body: unknown) =>
        fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      await post('/api/projects', {
        key,
        name: `Flow ${key}`,
        board_type: 'kanban',
      })
      const invite = await post(`/api/projects/${key}/invites`, {
        role: 'member',
      })
      return ((await invite.json()) as { token: string }).token
    },
    { key }
  )
  await teammate.evaluate(
    (token) => fetch(`/api/invites/${token}/accept`, { method: 'POST' }),
    token
  )

  await page.goto(`/p/${key}/board`)
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await page.getByLabel('New column name').fill('Review')
  await page.getByLabel('Its status').selectOption('none')
  await page.getByRole('button', { name: 'Add column' }).click()
  const wip = page.getByRole('spinbutton', { name: 'WIP limit of Review' })
  await wip.fill('2')
  await wip.press('Enter')

  await page.getByLabel('New status name').fill('In review')
  await page.getByLabel('Category').selectOption('in_progress')
  await page.getByRole('button', { name: 'Add status' }).click()
  const chip = page
    .getByRole('list', { name: 'Unmapped statuses' })
    .getByText('In review')
  const zone = page.getByRole('list', { name: 'Statuses in Review' })
  await expect(chip).toBeVisible()
  await expect(zone).toBeVisible()
  const from = await chip.boundingBox()
  if (!from) throw new Error('nothing to drag')
  const x = from.x + from.width / 2
  const y = from.y + from.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  // dnd-kit's pointer sensor starts the drag only after a few pixels of travel.
  await page.mouse.move(x + 12, y + 12, { steps: 4 })
  const to = await zone.boundingBox()
  if (!to) throw new Error('nowhere to drop')
  const mapped = page.waitForResponse(
    (response) =>
      response.request().method() !== 'GET' &&
      response.url().includes('/api/projects/')
  )
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
  expect((await mapped).ok()).toBe(true)
  await expect(zone).toContainText('In review')

  await page.reload()
  await expect(
    page.getByRole('list', { name: 'Statuses in Review' })
  ).toContainText('In review')
  await expect(
    page.getByRole('spinbutton', { name: 'WIP limit of Review' })
  ).toHaveValue('2')

  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Board' })
    .click()
  const review = page.getByRole('region', { name: 'Review', exact: true })
  await expect(review).toBeVisible()
  await expect(review).toContainText('Max 2')

  await teammate.goto(`/p/${key}/settings`)
  const danger = teammate.getByRole('region', { name: 'Danger zone' })
  await expect(
    danger.getByRole('button', { name: 'Leave project' })
  ).toBeVisible()
  await expect(danger.getByRole('button', { name: 'Archive' })).toHaveCount(0)
  await expect(
    teammate.getByRole('heading', { name: 'Board settings' })
  ).toHaveCount(0)
})
