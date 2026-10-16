/// <reference lib="dom" />
import { type Page, expect, test } from '@playwright/test'

// D39: INP < 100 ms. Event Timing reports interactions of 16 ms or more; none means faster.
// Shared CI runners are 2-4x slower than a laptop; the D39 100 ms budget holds locally.
const INP_BUDGET = process.env.CI ? 300 : 100
const CARDS = 250

declare global {
  interface Window {
    interactions: { name: string; duration: number }[]
  }
}

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

const worstInteraction = async (page: Page, name: string) => {
  // Event Timing entries land after the next paint.
  await page.waitForTimeout(300)
  const durations = await page.evaluate(() =>
    window.interactions.map((entry) => entry.duration)
  )
  const worst = Math.max(0, ...durations)
  test
    .info()
    .annotations.push({ type: `INP ${name}`, description: `${worst} ms` })
  await page.evaluate(() => (window.interactions = []))
  return worst
}

test(`INP stays under ${INP_BUDGET} ms on a ${CARDS}-card column`, async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.interactions = []
    // Event Timing's threshold is newer than the DOM types.
    const init: PerformanceObserverInit & { durationThreshold: number } = {
      type: 'event',
      durationThreshold: 16,
      buffered: true,
    }
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry instanceof PerformanceEventTiming && entry.interactionId)
          window.interactions.push({
            name: entry.name,
            duration: entry.duration,
          })
    }).observe(init)
  })
  await page.goto('/register')
  await page.getByLabel('Name').fill('Perf')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page
    .getByLabel('Password', { exact: true })
    .fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Hi, Perf' })).toBeVisible()
  const key = `P${unique().slice(-6).toUpperCase()}`
  // In Progress holds a second status, so the drop lands on a status zone (SB-17).
  const review = await page.evaluate(
    async ({ key, cards }) => {
      const send = async (method: string, path: string, body: unknown) =>
        (
          await fetch(path, {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        ).json()
      await send('POST', '/api/projects', {
        key,
        name: key,
        board_type: 'kanban',
      })
      for (let index = 1; index <= cards; index++)
        await send('POST', `/api/projects/${key}/issues`, {
          summary: `Card number ${index}`,
        })
      const settings: { columns: { id: number; name: string }[] } = await (
        await fetch(`/api/projects/${key}/board/settings`)
      ).json()
      const doing = settings.columns.find((each) => each.name === 'In Progress')
      const status: { id: number } = await send(
        'POST',
        `/api/projects/${key}/statuses`,
        { name: 'In review', category: 'in_progress' }
      )
      await send('PUT', `/api/projects/${key}/statuses/${status.id}`, {
        name: 'In review',
        column_id: doing?.id,
      })
      return status.id
    },
    { key, cards: CARDS }
  )
  await page.goto(`/p/${key}/board`)
  const handle = page.getByRole('button', {
    name: `Drag ${key}-1`,
    exact: true,
  })
  await expect(handle).toBeVisible()
  await worstInteraction(page, 'load')

  await handle.focus()
  await page.keyboard.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  // dnd-kit's keyboard sensor starts listening for arrows one tick after the pickup.
  await page.waitForTimeout(100)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText(/moved over droppable area/)).toBeAttached()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('group', { name: 'In review' })).toBeVisible()
  // Zone ids end with the status id.
  await expect(
    page.getByText(new RegExp(`droppable area zone:\\d+:${review}\\.`))
  ).toBeAttached()
  const moved = page.waitForRequest((request) =>
    request.url().endsWith(`/issues/1/move`)
  )
  await page.keyboard.press('Space')
  expect((await moved).postDataJSON()).toEqual({ status_id: review })
  await expect(
    page.getByRole('region', { name: 'In Progress', exact: true })
  ).toContainText('Card number 1')
  const drop = await worstInteraction(page, 'keyboard drop on a status zone')

  await page
    .getByRole('button', { name: `Actions for ${key}-2`, exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Set priority' }).click()
  await page.getByRole('menuitemradio', { name: 'Urgent' }).click()
  await expect(
    page
      .getByRole('region', { name: 'To Do', exact: true })
      .getByRole('article')
      .first()
  ).toContainText('Urgent priority')
  const menu = await worstInteraction(page, 'menu: set priority')

  await page.getByRole('link', { name: 'Card number 3', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `${key}-3` })
  await expect(dialog.getByLabel('Summary')).toHaveValue('Card number 3')
  const open = await worstInteraction(page, 'open the issue dialog')

  await dialog.getByLabel('Priority').selectOption('High')
  await page.keyboard.press('Escape')
  await expect(
    page
      .getByRole('region', { name: 'To Do', exact: true })
      .getByRole('article')
      .filter({
        has: page.getByRole('link', { name: 'Card number 3', exact: true }),
      })
  ).toContainText('High priority')
  const field = await worstInteraction(page, 'issue dialog: edit priority')

  // UI-26: the focus came back to card 3; j j k reach card 4, n and p land on the first card of To Do.
  for (const key of ['j', 'j', 'k', 'n', 'p']) await page.keyboard.press(key)
  await expect(
    page.getByRole('link', { name: 'Card number 2', exact: true })
  ).toBeFocused()
  const step = await worstInteraction(page, 'j/k between cards')

  expect(drop).toBeLessThan(INP_BUDGET)
  expect(menu).toBeLessThan(INP_BUDGET)
  expect(open).toBeLessThan(INP_BUDGET)
  expect(field).toBeLessThan(INP_BUDGET)
  expect(step).toBeLessThan(INP_BUDGET)
})
