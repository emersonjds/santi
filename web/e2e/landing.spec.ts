import { type Page, expect, test } from './fixtures'

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

test('the nav opens the pricing section with Self-host, Free and Team in that order', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Pricing' })
    .click()
  await expect(page).toHaveURL(/#pricing$/)

  const pricing = page.locator('#pricing')
  await expect(pricing).toBeInViewport()
  const plans = pricing.getByRole('listitem').filter({
    has: page.getByRole('heading', { level: 3 }),
  })
  await expect(plans.getByRole('heading', { level: 3 })).toHaveText([
    'Self-host',
    'Free',
    'Team',
  ])
  await expect(plans.nth(2)).toContainText('US$ 19')
  await expect(
    plans.nth(0).getByRole('link', { name: 'Read the guide' })
  ).toHaveAttribute(
    'href',
    'https://github.com/emersonjds/santi/blob/main/docs/self-hosting.md'
  )
  await expect(
    plans.nth(1).getByRole('link', { name: 'Try santi' })
  ).toHaveAttribute('href', '/register')
  await expect(
    plans.nth(2).getByRole('link', { name: 'Start free' })
  ).toHaveAttribute('href', '/register')
  await expect(page.getByRole('heading', { name: 'Coming next' })).toHaveCount(
    0
  )
})

test('the nav opens the AI section with a sample conversation and the MCP setup guide', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'AI', exact: true })
    .click()
  await expect(page).toHaveURL(/#ai$/)

  const ai = page.locator('#ai')
  await expect(ai).toBeInViewport()
  await expect(
    ai.getByRole('heading', {
      level: 2,
      name: 'Give an AI agent the keys to your board.',
    })
  ).toBeVisible()
  const transcript = ai.getByLabel(
    'Example conversation with an AI assistant connected to santi'
  )
  await expect(
    transcript.getByRole('listitem').filter({ hasText: 'You:' })
  ).toHaveCount(3)
  await expect(
    ai.getByRole('link', { name: 'Read the setup guide for every client' })
  ).toHaveAttribute(
    'href',
    'https://github.com/emersonjds/santi/blob/main/docs/mcp.md'
  )
  await expect(
    page.getByRole('heading', { name: 'Scripts and AI agents welcome.' })
  ).toHaveCount(0)

  await page.getByText('Can AI agents work with it?').click()
  await expect(page.getByText(/an MCP server with 38 tools/)).toBeVisible()
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the terminals show their full text without typing and Copy copies the whole command', async ({
    page,
  }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/#self-host')

    const selfHost = page.getByLabel('Commands to run santi with Docker')
    const cli = page.getByLabel('Example santi commands')
    await expect(selfHost.locator('.line')).toHaveCount(3)
    await expect(cli.locator('.line')).toHaveCount(6)
    expect(await selfHost.innerText()).toBe(
      '$ git clone https://github.com/emersonjds/santi.git\n$ cd santi\n$ docker compose up -d\n# open http://localhost:8080'
    )
    expect(await cli.innerText()).toBe(
      '$ santi login --url http://localhost:8080\n$ santi issues create WEB --summary "Fix login" --type bug\n$ santi issues move WEB-12 --status "In Progress"\n$ santi sprints start WEB 3\n\n# give an agent your boards\n$ claude mcp add santi --env SANTI_URL=http://localhost:8080 \\\n    --env SANTI_TOKEN=santi_… -- santi mcp'
    )
    const animations = await page
      .locator('.terminal, .terminal .line, .terminal .comment')
      .evaluateAll((elements) =>
        elements.flatMap((element) => [
          getComputedStyle(element).animationName,
          getComputedStyle(element, '::after').animationName,
        ])
      )
    expect(new Set(animations)).toEqual(new Set(['none']))

    await page
      .locator('#self-host')
      .getByRole('button', { name: 'Copy' })
      .click()
    await expect(
      page.locator('#self-host').getByRole('button', { name: 'Copied' })
    ).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'git clone https://github.com/emersonjds/santi.git && cd santi && docker compose up -d'
    )
  })
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
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number
              hadRecentInput: boolean
            }
            if (!shift.hadRecentInput) cls += shift.value
          }
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
    // CI runners sometimes report sub-pixel shifts; 0.01 is a tenth of the "good" bar (0.1).
    expect(cls).toBeLessThan(0.01)
  })
}
