import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'
const HEADLINE = 'Agile planning that keeps up with your team.'

const register = async (page: Page, name: string) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill(name)
  await page
    .getByLabel('Email')
    .fill(
      `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
    )
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: `Account (${name})` })
  ).toBeVisible()
}

const landingHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: HEADLINE })

test('a visitor without a session lands on the landing page and its CTA opens sign-up', async ({
  page,
}) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text()))
      violations.push(message.text())
  })
  page.on('pageerror', (error) => violations.push(error.message))

  await page.goto('/')
  await expect(landingHeading(page)).toBeVisible()
  await expect(page.locator('img[src="/brand/mark.svg"]').first()).toBeVisible()

  await page
    .getByRole('main')
    .getByRole('link', { name: 'Try santi' })
    .first()
    .click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(
    page.getByRole('button', { name: 'Create account' })
  ).toBeVisible()
  expect(violations).toEqual([])
})

test('signed in, / is the app and /about is still the landing page', async ({
  page,
}) => {
  await register(page, 'Lin')

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Account (Lin)' })
  ).toBeVisible()
  await expect(
    page.getByRole('banner').locator('img[src="/brand/mark.svg"]')
  ).toBeVisible()

  await page.goto('/about')
  await expect(landingHeading(page)).toBeVisible()
})

const lcpOf = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ lcp: number; cls: number }>((resolve) => {
        let lcp = 0
        let cls = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) lcp = entry.startTime
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            cls += (entry as PerformanceEntry & { value: number }).value
        }).observe({ type: 'layout-shift', buffered: true })
        setTimeout(() => resolve({ lcp, cls }), 500)
      })
  )

// Lighthouse's throttling presets: mobile is slow 4G with a 4x slower CPU, desktop is a cable line.
for (const profile of [
  {
    name: 'mobile',
    viewport: { width: 375, height: 812 },
    latency: 150,
    throughput: (1.6 * 1024 * 1024) / 8,
    cpu: 4,
  },
  {
    name: 'desktop',
    viewport: { width: 1440, height: 900 },
    latency: 40,
    throughput: (10 * 1024 * 1024) / 8,
    cpu: 1,
  },
]) {
  test(`the landing page paints its largest element within 1 s (${profile.name}, throttled)`, async ({
    page,
  }) => {
    await page.setViewportSize(profile.viewport)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.throughput,
      uploadThroughput: profile.throughput,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })

    await page.goto('/about', { waitUntil: 'load' })
    const { lcp, cls } = await lcpOf(page)

    expect(lcp).toBeGreaterThan(0)
    expect(lcp).toBeLessThan(1000)
    expect(cls).toBe(0)
  })
}
