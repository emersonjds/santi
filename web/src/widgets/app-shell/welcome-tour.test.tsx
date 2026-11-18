import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { openTour } from '@/shared/lib/tour'
import { renderApp } from '@/test/render-app'
import { ALICE, routeOf, signedIn } from '@/test/stub-api'

const SEEN = { ...ALICE, tour_seen_at: '2026-11-01T12:00:00Z' }

const visit = async (tourSeenAt: string | null, accepted = true) => {
  const user = { ...ALICE, tour_seen_at: tourSeenAt }
  const requests = signedIn({
    'GET /api/me': { status: 200, body: user },
    'PATCH /api/me': { status: 200, body: SEEN },
    'GET /api/me/legal': {
      status: 200,
      body: {
        required: true,
        terms_version: '2026-10-16',
        privacy_version: '2026-10-16',
        accepted,
      },
    },
  })
  const app = await renderApp('/')
  const writes = () =>
    Promise.all(
      requests
        .filter((request) => routeOf(request) === 'PATCH /api/me')
        .map((request) => request.clone().json())
    )
  return { ...app, writes }
}

const tour = (screen: Awaited<ReturnType<typeof visit>>['screen']) =>
  screen.getByRole('dialog')

describe('welcome tour', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('opens once on a first visit and walks five steps with Next, Back and Done', async () => {
    const { screen, writes } = await visit(null)

    const dialog = tour(screen)
    await expect
      .element(dialog.getByRole('heading', { name: 'Welcome to santi' }))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Step 1 of 5')
    expect(
      dialog.getByRole('button', { name: 'Back' }).elements()
    ).toHaveLength(0)

    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect
      .element(dialog.getByRole('heading', { name: 'Board and backlog' }))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Step 2 of 5')
    await dialog.getByRole('button', { name: 'Back' }).click()
    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Step 1 of 5')

    for (let step = 0; step < 4; step++)
      await dialog.getByRole('button', { name: 'Next' }).click()
    await expect
      .element(dialog.getByRole('heading', { name: 'Shortcuts, CLI and MCP' }))
      .toBeVisible()
    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Step 5 of 5')
    expect(
      dialog.getByRole('button', { name: 'Next' }).elements()
    ).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Done' }).click()

    await expect.element(dialog).not.toBeInTheDocument()
    await expect.poll(writes).toEqual([{ tour_seen: true }])
  })

  it('stays closed once the account has seen it', async () => {
    const { screen, writes } = await visit('2026-11-01T12:00:00Z')

    await expect
      .element(screen.getByRole('button', { name: 'Account' }))
      .toBeEnabled()
    expect(screen.getByRole('dialog').elements()).toHaveLength(0)
    expect(await writes()).toEqual([])
  })

  it('marks it seen once when skipped', async () => {
    const { screen, writes } = await visit(null)

    await tour(screen).getByRole('button', { name: 'Skip tour' }).click()

    await expect.element(tour(screen)).not.toBeInTheDocument()
    await expect.poll(writes).toEqual([{ tour_seen: true }])
  })

  it('marks it seen once when closed with Esc', async () => {
    const { screen, writes } = await visit(null)
    await expect.element(tour(screen)).toBeVisible()

    await userEvent.keyboard('{Escape}')

    await expect.element(tour(screen)).not.toBeInTheDocument()
    await expect.poll(writes).toEqual([{ tour_seen: true }])
  })

  it('closes and marks it seen when the route changes', async () => {
    const { screen, router, writes } = await visit(null)
    await expect.element(tour(screen)).toBeVisible()

    await router.navigate({ to: '/account' })

    await expect.element(tour(screen)).not.toBeInTheDocument()
    await expect.poll(writes).toEqual([{ tour_seen: true }])
  })

  it('replays from the account menu without writing, and gives the focus back to the menu', async () => {
    const { screen, writes } = await visit('2026-11-01T12:00:00Z')
    const account = screen.getByRole('button', { name: 'Account' })

    await account.click()
    await screen.getByRole('menuitem', { name: 'Take the tour' }).click()
    await expect
      .element(tour(screen).getByRole('heading', { name: 'Welcome to santi' }))
      .toBeVisible()
    await tour(screen).getByRole('button', { name: 'Skip tour' }).click()

    await expect.element(tour(screen)).not.toBeInTheDocument()
    await expect.element(account).toHaveFocus()
    expect(await writes()).toEqual([])
  })

  it('replays from the shortcuts sheet and from the empty home page', async () => {
    const { screen, writes } = await visit('2026-11-01T12:00:00Z')
    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()

    await userEvent.keyboard('?')
    await screen
      .getByRole('dialog', { name: 'Keyboard shortcuts' })
      .getByRole('button', { name: 'Replay the welcome tour' })
      .click()
    const dialog = screen.getByRole('dialog', { name: 'Welcome to santi' })
    await expect.element(dialog).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()

    await screen.getByRole('button', { name: 'Take the tour' }).click()
    await expect.element(dialog).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
    expect(await writes()).toEqual([])
  })

  it('stays closed while the account has not accepted the terms', async () => {
    const { screen, writes } = await visit(null, false)

    await expect
      .element(
        screen.getByRole('heading', { name: 'Review the updated terms' })
      )
      .toBeVisible()
    expect(
      screen.getByRole('dialog', { name: 'Welcome to santi' }).elements()
    ).toHaveLength(0)
    expect(await writes()).toEqual([])
  })

  it('gives the focus to the page when the first visit closes it', async () => {
    const { screen } = await visit(null)

    await tour(screen).getByRole('button', { name: 'Skip tour' }).click()

    await expect.element(tour(screen)).not.toBeInTheDocument()
    await expect.element(screen.getByRole('main')).toHaveFocus()
  })

  it('keeps the focus on the dialog when going back to the first step', async () => {
    const { screen } = await visit(null)
    const dialog = tour(screen)

    await dialog.getByRole('button', { name: 'Next' }).click()
    await dialog.getByRole('button', { name: 'Back' }).click()

    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Step 1 of 5')
    await expect
      .element(dialog.getByRole('button', { name: 'Next' }))
      .toHaveFocus()
  })

  it('does not finish on a fast double click on the last Next', async () => {
    const { screen, writes } = await visit(null)
    const dialog = tour(screen)
    for (let step = 0; step < 3; step++)
      await dialog.getByRole('button', { name: 'Next' }).click()

    await userEvent.dblClick(dialog.getByRole('button', { name: 'Next' }))

    await expect
      .element(dialog.getByRole('status'))
      .toHaveTextContent('Step 5 of 5')
    await expect.element(dialog).toBeVisible()
    expect(await writes()).toEqual([])
  })

  it('fills a 375px screen without horizontal scroll', async () => {
    await page.viewport(375, 812)
    const { screen } = await visit(null)
    await expect.element(tour(screen)).toBeVisible()

    const dialog = tour(screen).element()
    expect(dialog.clientWidth).toBe(375)
    expect(dialog.scrollWidth).toBe(dialog.clientWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
  })

  it('keeps the first visit when a replay is asked while it is open', async () => {
    const { screen, writes } = await visit(null)
    await expect.element(tour(screen)).toBeVisible()

    openTour()
    await tour(screen).getByRole('button', { name: 'Skip tour' }).click()

    await expect.element(tour(screen)).not.toBeInTheDocument()
    await expect.poll(writes).toEqual([{ tour_seen: true }])
  })
})
