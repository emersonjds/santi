import { type Locator, type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** A signed-in user with a scrum project holding three issues in no sprint. */
const scrumWithIssues = async (page: Page) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Hi, Ada' })).toBeVisible()

  const key = `S${unique().slice(-6).toUpperCase()}`
  await page.evaluate(async (key) => {
    const post = (path: string, body: unknown) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    await post('/api/projects', {
      key,
      name: `Plan ${key}`,
      board_type: 'scrum',
    })
    for (const summary of ['Alpha task', 'Beta task', 'Gamma task'])
      await post(`/api/projects/${key}/issues`, { summary })
  }, key)
  await page.goto(`/p/${key}/backlog`)
  return key
}

const section = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true })

const dragWithMouse = async (page: Page, from: Locator, to: Locator) => {
  const start = await from.boundingBox()
  const end = await to.boundingBox()
  if (!start || !end) throw new Error('nothing to drag')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
}

const moved = (page: Page, number: number) =>
  page.waitForResponse((response) =>
    response.url().endsWith(`/issues/${number}/move`)
  )

test('plan a sprint by drag, start it, finish one issue and complete it with the rest to the backlog', async ({
  page,
}) => {
  const key = await scrumWithIssues(page)
  await expect(section(page, 'Backlog')).toContainText('Gamma task')

  await section(page, 'Backlog')
    .getByRole('button', { name: 'Create sprint' })
    .click()
  await page
    .getByRole('dialog', { name: 'Create sprint' })
    .getByRole('button', { name: 'Create sprint' })
    .click()
  const sprint = section(page, 'Sprint 1')
  await expect(sprint).toContainText('Drag issues here to plan this sprint.')

  const first = moved(page, 1)
  await dragWithMouse(
    page,
    page.getByRole('button', { name: `Drag ${key}-1`, exact: true }),
    sprint.getByText('Drag issues here to plan this sprint.')
  )
  expect((await first).status()).toBe(200)
  await expect(sprint).toContainText('Alpha task')

  const second = moved(page, 2)
  await dragWithMouse(
    page,
    page.getByRole('button', { name: `Drag ${key}-2`, exact: true }),
    sprint.getByRole('listitem').first()
  )
  expect((await second).status()).toBe(200)
  await expect(sprint).toContainText('Beta task')
  await expect(sprint).toContainText('2 of 2 issues visible')

  await sprint.getByRole('button', { name: 'Start sprint' }).click()
  const start = page.getByRole('dialog', { name: 'Start Sprint 1' })
  await expect(start).toContainText('2 issues will be on the board.')
  await start.getByRole('button', { name: 'Start sprint' }).click()
  await expect(start).toBeHidden()
  await expect(sprint.getByText('Active', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Board', exact: true }).first().click()
  const todo = page.getByRole('region', { name: 'To Do', exact: true })
  await expect(todo.getByRole('article')).toHaveCount(2)
  await page
    .getByRole('button', { name: `Actions for ${key}-1`, exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Move to…' }).click()
  await page
    .getByRole('menuitem', { name: 'Move to the bottom of Done' })
    .click()
  await expect(
    page.getByRole('region', { name: 'Done', exact: true })
  ).toContainText('Alpha task')

  await page.getByRole('link', { name: 'Backlog', exact: true }).first().click()
  await sprint.getByRole('button', { name: 'Complete sprint' }).click()
  const complete = page.getByRole('dialog', { name: 'Complete Sprint 1' })
  await expect(complete).toContainText('1 issue done · 1 open')
  await expect(complete.getByRole('radio', { name: 'Backlog' })).toBeChecked()
  await complete.getByRole('button', { name: 'Complete sprint' }).click()
  await expect(complete).toBeHidden()

  await expect(section(page, 'Backlog')).toContainText('Beta task')
  await expect(section(page, 'Sprint 1')).toBeHidden()
  await page.getByRole('link', { name: 'Board', exact: true }).first().click()
  await expect(page.getByText('No sprint is running.')).toBeVisible()
})
