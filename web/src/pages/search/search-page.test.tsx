import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Issue } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import { inProjects, issue, routeOf } from '@/test/stub-api'

const RESULTS = [
  issue({ key: 'WEB-1', summary: 'Write the release notes' }),
  issue({
    key: 'WEB-2',
    summary: 'Fix the login redirect loop',
    issue_type: 'bug',
    status_id: 20,
    assignee_id: 2,
  }),
  issue({ key: 'WEB-5', summary: 'Ship the login page', status_id: 30 }),
]

const SEARCH = 'GET /api/projects/WEB/issues'

const withPages = (
  ...pages: { items: Issue[]; next_cursor: number | null }[]
) => {
  let call = 0
  return inProjects({
    [SEARCH]: {
      status: 200,
      body: () => pages[Math.min(call++, pages.length - 1)],
    },
  })
}

const withResults = (items: Issue[]) => withPages({ items, next_cursor: null })

/** The search itself, not the Epic filter's list of epics. */
const lastSearch = (requests: Request[]) => {
  const searches = requests.filter(
    (request) =>
      routeOf(request) === SEARCH &&
      new URL(request.url).searchParams.get('type') !== 'epic'
  )
  return new URL(searches[searches.length - 1].url).searchParams
}

describe('search page', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('lists the matches with type, key, status, assignee and last update', async () => {
    const requests = withResults(RESULTS)
    const { screen } = await renderApp('/p/WEB/search?q=login')

    await expect
      .element(screen.getByRole('heading', { name: 'Search' }))
      .toBeVisible()
    const row = screen.getByRole('listitem').filter({ hasText: 'WEB-2' })
    await expect.element(row.getByText('Bug')).toBeInTheDocument()
    await expect
      .element(row.getByRole('link', { name: 'Fix the login redirect loop' }))
      .toBeVisible()
    await expect.element(row.getByText('In progress')).toBeVisible()
    await expect.element(row.getByTitle('Assigned to Bob Stone')).toBeVisible()
    await expect.element(row.getByText('3 hours ago')).toBeVisible()
    expect(lastSearch(requests).get('q')).toBe('login')
    expect(lastSearch(requests).get('limit')).toBe('50')
  })

  it('keeps the filters in the URL and sends them to the server', async () => {
    const requests = withResults(RESULTS)
    const { screen, router } = await renderApp('/p/WEB/search?q=login')

    await screen.getByRole('button', { name: 'Type' }).click()
    await screen.getByRole('menuitemcheckbox', { name: 'Bug' }).click()
    await userEvent.keyboard('{Escape}')
    await screen.getByRole('button', { name: 'Recently updated' }).click()
    await screen.getByRole('button', { name: 'Issues of Bob Stone' }).click()

    await expect
      .poll(() => router.state.location.search)
      .toEqual({
        q: 'login',
        type: ['bug'],
        recently_updated: true,
        assignee: [2],
      })
    await expect.poll(() => lastSearch(requests).get('assignee')).toBe('2')
    expect(lastSearch(requests).get('type')).toBe('bug')
    expect(lastSearch(requests).get('recently_updated')).toBe('true')
    expect(lastSearch(requests).get('q')).toBe('login')

    await screen.getByRole('link', { name: 'Clear filters' }).click()

    await expect
      .poll(() => router.state.location.search)
      .toEqual({ q: 'login' })
  })

  it('reads the filters back from a shared link', async () => {
    withResults(RESULTS)
    const { screen } = await renderApp(
      '/p/WEB/search?q=login&type=bug&status=done'
    )

    await expect
      .element(screen.getByRole('button', { name: 'Type' }))
      .toHaveTextContent('Type1')
    await expect.element(screen.getByLabelText('Status')).toHaveValue('done')
  })

  it('asks the server for a status category', async () => {
    const requests = withResults(RESULTS)
    const { screen, router } = await renderApp('/p/WEB/search?q=login')

    await screen.getByLabelText('Status').selectOptions('Done')

    await expect.poll(() => lastSearch(requests).get('status')).toBe('done')
    expect(router.state.location.search).toEqual({ q: 'login', status: 'done' })
    await expect
      .element(screen.getByRole('link', { name: 'Fix the login redirect loop' }))
      .toBeVisible()
  })

  it('says so when nothing matches', async () => {
    withResults([])
    const { screen } = await renderApp('/p/WEB/search?q=nothing')

    await expect
      .element(
        screen.getByText(
          'No issues match “nothing”. Try fewer words or clear filters.'
        )
      )
      .toBeVisible()
  })

  it('loads the next page on demand', async () => {
    const requests = withPages(
      { items: RESULTS.slice(0, 2), next_cursor: 2 },
      { items: RESULTS.slice(2), next_cursor: null }
    )
    const { screen } = await renderApp('/p/WEB/search?q=login')

    await screen.getByRole('button', { name: 'Show more' }).click()

    await expect
      .element(screen.getByRole('link', { name: 'Ship the login page' }))
      .toBeVisible()
    expect(lastSearch(requests).get('cursor')).toBe('2')
    expect(
      screen.getByRole('button', { name: 'Show more' }).elements()
    ).toHaveLength(0)
  })

  it('opens a result over the list, under the issue URL', async () => {
    withResults(RESULTS)
    const { screen, router } = await renderApp('/p/WEB/search?q=release')

    await screen.getByRole('link', { name: 'Write the release notes' }).click()

    await expect
      .poll(() => router.state.location.maskedLocation?.pathname)
      .toBe('/p/WEB/issues/1')
    expect(router.state.location.search).toEqual({ q: 'release', issue: 1 })
    await expect
      .element(screen.getByRole('dialog', { name: 'WEB-1' }))
      .toBeVisible()
  })
})
