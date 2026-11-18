import { expect, test } from './fixtures'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

test('an admin changes the key; the old URL moves to the new key and issues take its prefix (SAN-225)', async ({
  page,
}) => {
  const tail = unique().slice(-5).toUpperCase()
  const old = `R${tail}`
  const renamed = `N${tail}`
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await page.evaluate(async (key) => {
    const post = (path: string, body: unknown) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    await post('/api/projects', {
      key,
      name: `Rename ${key}`,
      board_type: 'kanban',
    })
    await post(`/api/projects/${key}/issues`, { summary: 'Keep my number' })
  }, old)

  await page.goto(`/p/${old}/settings`)
  const general = page.getByRole('region', { name: 'General' })
  await general.getByRole('textbox', { name: 'Project key' }).fill(renamed)
  await general.getByRole('button', { name: 'Save' }).click()
  await expect(
    page.getByText(`Saved. ${renamed} is now the project's key.`)
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/p/${renamed}/settings$`))
  await expect(general.getByRole('list', { name: 'Previous keys' })).toHaveText(
    new RegExp(old)
  )

  await page.goto(`/p/${old}/board`)
  await expect(page).toHaveURL(new RegExp(`/p/${renamed}/board$`))
  await expect(
    page.getByRole('link', { name: 'Keep my number' })
  ).toHaveAttribute('href', `/p/${renamed}/issues/1`)
  await expect(page.getByText(`${renamed}-1`, { exact: true })).toBeVisible()
})
