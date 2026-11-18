import {
  type Browser,
  type BrowserContext,
  test as base,
} from '@playwright/test'

export * from '@playwright/test'

/** Specs about other flows start with the welcome tour (SAN-230) already seen; tour.spec.ts covers it. */
const skipTour = (context: BrowserContext) =>
  context.route(/\/api\/(me|auth\/[a-z-]+)$/, async (route) => {
    const response = await route.fetch()
    const user = response.ok() ? await response.json().catch(() => null) : null
    if (user?.tour_seen_at !== null) return route.fulfill({ response })
    await route.fulfill({
      response,
      json: { ...user, tour_seen_at: '2026-01-01T00:00:00Z' },
    })
  })

/** A second person's browser, e.g. a teammate opening an invite. */
export const newPage = async (browser: Browser) => {
  const context = await browser.newContext()
  await skipTour(context)
  return context.newPage()
}

export const test = base.extend({
  context: async ({ context }, provide) => {
    await skipTour(context)
    await provide(context)
  },
})
