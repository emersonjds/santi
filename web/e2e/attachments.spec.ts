import { expect, test } from '@playwright/test'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

test('an image attached to an issue shows as a tile and can be deleted', async ({
  page,
}) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page
    .getByLabel('Password', { exact: true })
    .fill('correct horse battery')
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()

  const key = `A${unique().slice(-6).toUpperCase()}`
  await page.evaluate(async (key) => {
    const post = (path: string, body: unknown) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    await post('/api/projects', {
      key,
      name: `Files ${key}`,
      board_type: 'kanban',
    })
    await post(`/api/projects/${key}/issues`, { summary: 'Has a picture' })
  }, key)
  await page.goto(`/p/${key}/issues/1`)
  const section = page.getByRole('region', { name: /^Attachments/ })
  await expect(section.getByText('No attachments yet.')).toBeVisible()

  await page.locator('input[type=file]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  })

  await expect(
    section.getByRole('heading', { name: 'Attachments · 1' })
  ).toBeVisible()
  const tile = section.getByRole('img', { name: 'pixel.png' })
  await expect
    .poll(() => tile.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1)

  await section.getByRole('button', { name: 'Delete pixel.png' }).click()
  await page
    .getByRole('alertdialog', { name: 'Delete pixel.png?' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(section.getByText('No attachments yet.')).toBeVisible()
  await page.reload()
  await expect(section.getByText('No attachments yet.')).toBeVisible()
})
