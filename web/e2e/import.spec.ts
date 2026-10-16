import { type Page, expect, test } from '@playwright/test'
import path from 'node:path'

const PASSWORD = 'correct horse battery'
const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../crates/santi-server/tests/fixtures/imports'
)

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** A signed-in admin of a new, empty project. */
const emptyProject = async (page: Page, board_type: 'scrum' | 'kanban') => {
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
  const key = `I${unique().slice(-6).toUpperCase()}`
  await page.evaluate(
    (body) =>
      fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { key, name: `Moved ${key}`, board_type }
  )
  return key
}

const importFile = async (page: Page, file: string) => {
  await page
    .getByLabel('Choose a CSV file')
    .setInputFiles(`${FIXTURES}/${file}`)
  await expect(
    page.getByRole('heading', { name: 'Review the mapping' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(
    page.getByRole('heading', { name: 'Import finished' })
  ).toBeVisible()
  return page.getByRole('list', { name: 'Import counts' })
}

test('an admin imports a Jira export into a scrum project, and a second import skips every row', async ({
  page,
}) => {
  const key = await emptyProject(page, 'scrum')
  await page.goto(`/p/${key}/backlog`)
  await page
    .getByRole('link', { name: 'Bring your work from another tracker' })
    .click()

  const counts = await importFile(page, 'jira.csv')
  await expect(counts).toContainText('Created4')
  await page.getByRole('link', { name: 'Open backlog' }).click()

  // Done and subtask rows stay off the backlog; the open bug lands in it, the sprint is planned.
  const main = page.getByRole('main')
  await expect(main.getByRole('link', { name: 'Fix rounding' })).toBeVisible()
  await expect(main.getByRole('region', { name: 'Sprint 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Epics' }).click()
  await expect(
    page.getByRole('complementary').getByText('Checkout flow')
  ).toBeVisible()

  await page.goto(`/p/${key}/issues/2`)
  await expect(page.getByRole('textbox', { name: 'Summary' })).toHaveValue(
    'Pay with card'
  )
  await expect(
    page.getByRole('link', { name: 'Validate card number' })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: `${key}-1` })).toBeVisible()

  await page.goto(`/p/${key}/settings/import`)
  const again = await importFile(page, 'jira.csv')
  await expect(again).toContainText('Created0')
  await expect(again).toContainText('Skipped4')
  await expect(
    page.getByText(/were imported from this Jira export before/)
  ).toBeVisible()
})

test('an admin imports a Linear export into a kanban project, without sprints', async ({
  page,
}) => {
  const key = await emptyProject(page, 'kanban')
  await page.goto(`/p/${key}/settings`)
  await page.getByRole('link', { name: 'Import issues' }).click()
  await page
    .getByLabel('Choose a CSV file')
    .setInputFiles(`${FIXTURES}/linear.csv`)
  await expect(page.getByText('Linear export, 3 rows.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sprints' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByRole('list', { name: 'Import counts' })).toContainText(
    'Created3'
  )
  await page.getByRole('link', { name: 'Open board' }).click()
  await expect(page.getByText('Ship onboarding')).toBeVisible()
  await expect(page.getByTitle('1 of 1 subtasks open')).toBeVisible()
})
