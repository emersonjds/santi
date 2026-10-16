import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

const register = async (page: Page, name: string, email: string) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: `Hi, ${name}` })).toBeVisible()
}

test('an admin adds a Review column with a WIP limit and maps a new status into it; a member gets 403', async ({
  page,
  browser,
}) => {
  const key = `S${unique().slice(-6).toUpperCase()}`
  await register(page, 'Ada', `e2e-${unique()}@example.com`)
  const teammate = await (await browser.newContext()).newPage()
  const graceEmail = `e2e-${unique()}@example.com`
  await register(teammate, 'Grace', graceEmail)
  await page.evaluate(
    async ({ key, email }) => {
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
      await post(`/api/projects/${key}/members`, { email, role: 'member' })
    },
    { key, email: graceEmail }
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
  const from = await chip.boundingBox()
  const to = await zone.boundingBox()
  if (!from || !to) throw new Error('nothing to drag')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
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
  await expect(
    teammate.getByText('Only project admins can change settings.')
  ).toBeVisible()
  await expect(
    teammate
      .getByRole('navigation', { name: 'Project views' })
      .getByRole('link', { name: 'Settings' })
  ).toHaveCount(0)
})
