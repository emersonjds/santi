import { focusManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Notification } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  inProjects,
  notification,
  problem,
  routeOf,
  signedIn,
} from '@/test/stub-api'

const COUNT = 'GET /api/notifications/unread-count'
const LIST = 'GET /api/notifications'

const counted = (count: number) => ({ status: 200, body: { count } })

const pageOf = (items: Notification[], next_cursor: number | null = null) => ({
  status: 200,
  body: { items, next_cursor },
})

const bell = (screen: RenderResult) =>
  screen.getByRole('button', { name: /^Notifications/ })

const openPanel = async (screen: RenderResult) => {
  await bell(screen).click()
  const panel = screen.getByRole('dialog', { name: 'Notifications' })
  await expect.element(panel).toBeVisible()
  return panel
}

const MENTION = notification({
  id: 3,
  kind: 'mention',
  comment_id: 1,
  excerpt: 'Can [@Alice](mention:1) check the draft?',
})
const ASSIGNED = notification({
  id: 2,
  kind: 'assigned',
  issue_key: 'WEB-2',
  issue_summary: 'Fix the login redirect loop',
  excerpt: '<img src=x onerror="window.injected=1">',
  read_at: new Date().toISOString(),
})
const COMMENTED = notification({
  id: 1,
  kind: 'comment',
  issue_key: 'WEB-3',
  issue_summary: 'Keep the redirect target',
  comment_id: 9,
  excerpt: 'Done on my side.',
})

describe('notifications bell', () => {
  beforeEach(() => page.viewport(1280, 800))

  it.each([
    [0, 'Notifications', null],
    [3, 'Notifications, 3 unread', '3'],
    [12, 'Notifications, 12 unread', '9+'],
  ])('shows %i unread as its label and badge', async (count, label, badge) => {
    signedIn({ [COUNT]: counted(count) })
    const { screen } = await renderApp('/')

    const button = screen.getByRole('button', { name: label, exact: true })
    await expect.element(button).toBeEnabled()
    if (badge) await expect.element(button).toHaveTextContent(badge)
    else expect(button.element().textContent).toBe('')
    const { width, height } = button.element().getBoundingClientRect()
    expect(Math.min(width, height)).toBeGreaterThanOrEqual(36)
  })

  it('asks for the count every minute and on focus, never while hidden', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const requests = signedIn({ [COUNT]: counted(1) })
    const { screen } = await renderApp('/')
    await expect.element(bell(screen)).toBeEnabled()
    const asked = () =>
      requests.filter((request) => routeOf(request) === COUNT).length
    const before = asked()

    vi.advanceTimersByTime(60_000)
    await expect.poll(asked).toBe(before + 1)

    focusManager.setFocused(false)
    vi.advanceTimersByTime(120_000)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(asked()).toBe(before + 1)

    focusManager.setFocused(true)
    await expect.poll(asked).toBe(before + 2)
  })

  afterEach(() => {
    vi.useRealTimers()
    focusManager.setFocused(undefined)
  })
})

describe('notifications panel', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('says who did what on which issue, with the excerpt as plain text', async () => {
    signedIn({
      [COUNT]: counted(2),
      [LIST]: pageOf([MENTION, ASSIGNED, COMMENTED]),
    })
    const { screen } = await renderApp('/')
    const panel = await openPanel(screen)

    const rows = panel.getByRole('listitem')
    await expect
      .element(rows.nth(0))
      .toHaveTextContent(
        /Bob Stone mentioned you on WEB-1.*Write the release notes.*Can @Alice check the draft\?.*2 hours ago/
      )
    await expect
      .element(rows.nth(1))
      .toHaveTextContent(/Bob Stone assigned WEB-2 to you/)
    await expect
      .element(rows.nth(1))
      .toHaveTextContent('<img src=x onerror="window.injected=1">')
    expect(panel.element().querySelector('img')).toBeNull()
    await expect
      .element(rows.nth(2))
      .toHaveTextContent(
        /Bob Stone commented on WEB-3.*Keep the redirect target/
      )
    await expect.element(rows.nth(0)).toHaveTextContent(/Unread/)
    expect(rows.nth(1).element().textContent).not.toMatch(/Unread/)
    await expect
      .element(panel.getByRole('button', { name: 'Mark all as read' }))
      .toBeVisible()
  })

  it('opens the issue at the comment and marks the row read', async () => {
    let read = false
    const requests = inProjects({
      [COUNT]: { status: 200, body: () => ({ count: read ? 0 : 1 }) },
      [LIST]: pageOf([MENTION]),
      'POST /api/notifications/3/read': {
        status: 204,
        until: async () => {
          read = true
        },
      },
    })
    const { screen, router } = await renderApp('/')
    const panel = await openPanel(screen)

    await panel.getByRole('link', { name: /mentioned you on WEB-1/ }).click()

    await expect
      .element(
        screen.getByRole('button', { name: 'Notifications', exact: true })
      )
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/issues/1')
    expect(router.state.location.hash).toBe('comment-1')
    expect(requests.map(routeOf)).toContain('POST /api/notifications/3/read')
    await expect
      .element(screen.getByRole('dialog', { name: 'Notifications' }))
      .not.toBeInTheDocument()
  })

  it('opens an issue with no comment from the keyboard', async () => {
    const requests = inProjects({
      [COUNT]: counted(1),
      [LIST]: pageOf([{ ...ASSIGNED, issue_key: 'WEB-1', read_at: null }]),
      'POST /api/notifications/2/read': { status: 204 },
    })
    const { screen, router } = await renderApp('/')
    const panel = await openPanel(screen)

    const row = panel.getByRole('link', { name: /assigned WEB-1/ })
    await expect.element(row).toBeVisible()
    row.element().focus()
    await userEvent.keyboard('{Enter}')

    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/WEB/issues/1')
    expect(router.state.location.hash).toBe('')
    expect(requests.map(routeOf)).toContain('POST /api/notifications/2/read')
  })

  it('marks everything read at once and puts the count back when it fails', async () => {
    const requests = signedIn({
      [COUNT]: counted(2),
      [LIST]: pageOf([MENTION, COMMENTED]),
      'POST /api/notifications/read-all': {
        status: 500,
        body: problem(500, 'Down.'),
      },
    })
    const { screen } = await renderApp('/')
    const panel = await openPanel(screen)

    await panel.getByRole('button', { name: 'Mark all as read' }).click()

    expect(requests.map(routeOf)).toContain('POST /api/notifications/read-all')
    await expect
      .element(screen.getByText('Notifications were not marked as read'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Notifications, 2 unread' }))
      .toBeVisible()
  })

  it('clears the badge and every dot when all are marked read', async () => {
    let read = false
    signedIn({
      [COUNT]: { status: 200, body: () => ({ count: read ? 0 : 2 }) },
      [LIST]: {
        status: 200,
        body: () => ({
          items: [MENTION, COMMENTED].map((each) => ({
            ...each,
            read_at: read ? new Date().toISOString() : null,
          })),
          next_cursor: null,
        }),
      },
      'POST /api/notifications/read-all': {
        status: 204,
        until: async () => {
          read = true
        },
      },
    })
    const { screen } = await renderApp('/')
    const panel = await openPanel(screen)

    await panel.getByRole('button', { name: 'Mark all as read' }).click()

    await expect
      .element(
        screen.getByRole('button', { name: 'Notifications', exact: true })
      )
      .toBeVisible()
    expect(panel.getByText('Unread').elements()).toHaveLength(0)
    expect(
      panel.getByRole('button', { name: 'Mark all as read' }).query()
    ).toBeNull()
  })

  it('loads the next page on Load more', async () => {
    const requests = signedIn({
      [COUNT]: counted(0),
      [LIST]: {
        status: 200,
        body: (request: Request) =>
          new URL(request.url).searchParams.get('cursor') === '3'
            ? { items: [COMMENTED], next_cursor: null }
            : {
                items: [{ ...MENTION, read_at: MENTION.created_at }],
                next_cursor: 3,
              },
      },
    })
    const { screen } = await renderApp('/')
    const panel = await openPanel(screen)

    await panel.getByRole('button', { name: 'Load more' }).click()

    await expect.element(panel.getByText(/commented on WEB-3/)).toBeVisible()
    expect(
      requests.some(
        (request) =>
          routeOf(request) === LIST &&
          new URL(request.url).searchParams.get('cursor') === '3'
      )
    ).toBe(true)
    expect(panel.getByRole('button', { name: 'Load more' }).query()).toBeNull()
  })

  it('says when there is nothing new', async () => {
    signedIn()
    const { screen } = await renderApp('/')
    const panel = await openPanel(screen)

    await expect.element(panel.getByText("You're all caught up.")).toBeVisible()
    expect(
      panel.getByRole('button', { name: 'Mark all as read' }).query()
    ).toBeNull()
  })

  it('offers Try again when the list does not load', async () => {
    signedIn({
      [LIST]: {
        status: 500,
        body: problem(500, 'Down.'),
      },
    })
    const { screen } = await renderApp('/')
    const panel = await openPanel(screen)

    await expect
      .element(panel.getByText('Notifications did not load.'))
      .toBeVisible()
    signedIn({ [LIST]: pageOf([COMMENTED]) })
    await panel.getByRole('button', { name: 'Try again' }).click()

    await expect.element(panel.getByText(/commented on WEB-3/)).toBeVisible()
  })

  it('rises from the bottom as a full-width sheet at 375 px', async () => {
    await page.viewport(375, 800)
    signedIn({ [COUNT]: counted(1), [LIST]: pageOf([MENTION]) })
    const { screen } = await renderApp('/')
    const panel = await openPanel(screen)

    await expect.element(panel.getByText(/mentioned you/)).toBeVisible()
    await expect
      .poll(() => Math.round(panel.element().getBoundingClientRect().bottom))
      .toBe(window.innerHeight)
    const box = panel.element().getBoundingClientRect()
    expect(Math.round(box.width)).toBe(375)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    for (const name of ['Close', 'Mark all as read']) {
      const target = panel.getByRole('button', { name }).element()
      expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
    const row = panel.getByRole('link', { name: /mentioned you/ }).element()
    expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })
})
