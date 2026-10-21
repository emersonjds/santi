/// <reference lib="dom" />
import { type Page, expect, test } from '@playwright/test'

// D39: INP < 100 ms. Event Timing reports interactions of 16 ms or more; none means faster.
// Shared CI runners are 2-4x slower than a laptop; the D39 100 ms budget holds locally.
const INP_BUDGET = process.env.CI ? 300 : 100
// Over the 200-row line, so the backlog section is virtualized.
const ISSUES = 250

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

test(`INP stays under ${INP_BUDGET} ms on a ${ISSUES}-issue backlog`, async ({
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
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Account (Perf)' })
  ).toBeVisible()
  const key = `Q${unique().slice(-6).toUpperCase()}`
  await page.evaluate(
    async ({ key, issues }) => {
      const send = (method: string, path: string, body: unknown) =>
        fetch(path, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      await send('POST', '/api/projects', {
        key,
        name: key,
        board_type: 'scrum',
      })
      const sprint = await (
        await send('POST', `/api/projects/${key}/sprints`, {})
      ).json()
      for (let index = 1; index <= issues; index++)
        await send('POST', `/api/projects/${key}/issues`, {
          summary: `Issue number ${index}`,
        })
      await send('PATCH', `/api/projects/${key}/issues/1`, {
        sprint_id: sprint.id,
      })
    },
    { key, issues: ISSUES }
  )
  await page.goto(`/p/${key}/backlog`)
  const handle = page.getByRole('button', {
    name: `Drag ${key}-3`,
    exact: true,
  })
  await expect(handle).toBeVisible()
  await worstInteraction(page, 'load')

  const moved = page.waitForResponse((response) =>
    response.url().endsWith('/issues/3/move')
  )
  await handle.focus()
  await page.keyboard.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  // dnd-kit's keyboard sensor starts listening for arrows one tick after the pickup.
  await page.waitForTimeout(100)
  await page.keyboard.press('ArrowUp')
  await expect(
    page.getByText(`moved over droppable area ${key}-2`)
  ).toBeAttached()
  await page.keyboard.press('Space')
  expect((await moved).status()).toBe(200)
  const drop = await worstInteraction(page, 'backlog keyboard drag and drop')

  await page
    .getByRole('region', { name: 'Sprint 1', exact: true })
    .getByRole('button', { name: 'Start sprint' })
    .click()
  await expect(
    page
      .getByRole('dialog', { name: 'Start Sprint 1' })
      .getByLabel('Start date')
  ).toBeVisible()
  const dialog = await worstInteraction(page, 'open the start sprint dialog')

  expect(drop).toBeLessThan(INP_BUDGET)
  expect(dialog).toBeLessThan(INP_BUDGET)
})
