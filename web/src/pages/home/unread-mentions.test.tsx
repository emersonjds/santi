import { beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { MY_WEB, notification, routeOf, signedIn } from '@/test/stub-api'

const mention = (id: number) =>
  notification({
    id,
    kind: 'mention',
    issue_key: `WEB-${id}`,
    comment_id: id * 10,
    excerpt: `Look at this [@Alice](mention:1) ${id}`,
  })

describe('unread mentions on For you', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('lists the five newest unread mentions first', async () => {
    const requests = signedIn({
      'GET /api/me/projects': { status: 200, body: [MY_WEB] },
      'GET /api/notifications': {
        status: 200,
        body: { items: [8, 7, 6, 5, 4].map(mention), next_cursor: 3 },
      },
    })
    const { screen, router } = await renderApp('/')

    const section = screen.getByRole('region', { name: 'Unread mentions' })
    await expect.element(section).toBeVisible()
    const links = section.getByRole('link')
    expect(links.elements()).toHaveLength(5)
    await expect
      .element(links.first())
      .toHaveTextContent(
        /Bob Stone mentioned you on WEB-8.*Look at this @Alice 8/
      )
    const asked = requests.find(
      (request) => routeOf(request) === 'GET /api/notifications'
    )
    const query = new URL(asked!.url).searchParams
    expect(Object.fromEntries(query)).toEqual({
      unread: 'true',
      kind: 'mention',
      limit: '5',
    })

    await links.first().click()
    expect(router.state.location.pathname).toBe('/p/WEB/issues/8')
    expect(router.state.location.hash).toBe('comment-80')
  })

  it('shows nothing when no mention is unread', async () => {
    const requests = signedIn({
      'GET /api/me/projects': { status: 200, body: [MY_WEB] },
      'GET /api/notifications': {
        status: 200,
        body: {
          items: [],
          next_cursor: null,
        },
      },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('heading', { name: 'Recommended projects' }))
      .toBeVisible()
    await expect
      .poll(() => requests.map(routeOf))
      .toContain('GET /api/notifications')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(
      screen.getByRole('region', { name: 'Unread mentions' }).query()
    ).toBeNull()
  })
})
