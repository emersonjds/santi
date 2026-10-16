import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Backlog } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  WEB_BACKLOG,
  inProjects,
  issue,
  problem,
  routeOf,
} from '@/test/stub-api'

const PANEL = '/p/WEB/backlog?panel=epics'
const BACKLOG = 'GET /api/projects/WEB/backlog'
const pending = { status: 200, body: {}, until: new Promise(() => {}) }

const TWO_EPICS: Backlog = {
  ...WEB_BACKLOG,
  epics: [
    {
      key: 'WEB-9',
      summary: 'Checkout revamp',
      child_count: 4,
      done_child_count: 1,
      done: false,
    },
    {
      key: 'WEB-10',
      summary: 'Search revamp',
      child_count: 0,
      done_child_count: 0,
      done: false,
    },
  ],
}

const backlogQueries = (requests: Request[]) =>
  requests
    .filter((request) => routeOf(request) === BACKLOG)
    .map((request) => new URL(request.url).search)

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const panelOf = (screen: RenderResult) =>
  screen.getByRole('complementary', { name: 'Epics' })

const epicLink = (screen: RenderResult, key: string) =>
  panelOf(screen).getByRole('button', { name: new RegExp(`^${key} `) })

const rowOf = (screen: RenderResult, key: string) =>
  screen.getByRole('listitem').filter({ hasText: key })

describe('epic panel', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('opens from the toolbar into the URL and closes the same way', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/backlog')
    const toggle = screen.getByRole('button', { name: 'Epics' })

    await expect.element(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()

    await expect
      .poll(() => router.state.location.search)
      .toEqual({
        panel: 'epics',
      })
    await expect.element(panelOf(screen)).toBeVisible()
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true')

    await toggle.click()

    await expect.poll(() => router.state.location.search).toEqual({})
    await expect.element(panelOf(screen)).not.toBeInTheDocument()
  })

  it('lists all issues, issues without an epic and each epic with its children and progress', async () => {
    inProjects({ [BACKLOG]: { status: 200, body: TWO_EPICS } })
    const { screen } = await renderApp(PANEL)

    const panel = panelOf(screen)
    await expect
      .element(panel.getByRole('button', { name: 'All issues' }))
      .toBeVisible()
    await expect
      .element(panel.getByRole('button', { name: 'Issues without epic' }))
      .toBeVisible()
    await expect
      .element(epicLink(screen, 'WEB-9'))
      .toHaveTextContent('Checkout revamp4 issues · 1 done')
    await expect
      .element(
        panel.getByRole('progressbar', { name: 'Checkout revamp progress' })
      )
      .toHaveAttribute('aria-valuenow', '25')
    await expect
      .element(epicLink(screen, 'WEB-10'))
      .toHaveTextContent('Search revamp0 issues · 0 done')
    await expect
      .element(screen.getByRole('region', { name: 'Backlog' }))
      .not.toHaveTextContent('Checkout revamp4')
  })

  it('says so when the project has no epics yet', async () => {
    inProjects({
      [BACKLOG]: { status: 200, body: { ...WEB_BACKLOG, epics: [] } },
    })
    const { screen } = await renderApp(PANEL)

    await expect
      .element(panelOf(screen).getByText('No epics yet.'))
      .toBeVisible()
  })

  it('filters the backlog by an epic or by no epic; a second pick clears it', async () => {
    const requests = inProjects()
    const { screen, router } = await renderApp(PANEL)

    await epicLink(screen, 'WEB-9').click()

    await expect
      .poll(() => router.state.location.search)
      .toEqual({ panel: 'epics', epic: 'WEB-9' })
    await expect.poll(() => backlogQueries(requests)).toContain('?parent=WEB-9')
    await expect
      .element(epicLink(screen, 'WEB-9'))
      .toHaveAttribute('aria-pressed', 'true')

    await epicLink(screen, 'WEB-9').click()
    await expect
      .poll(() => router.state.location.search)
      .toEqual({ panel: 'epics' })

    await panelOf(screen)
      .getByRole('button', { name: 'Issues without epic' })
      .click()
    await expect.poll(() => backlogQueries(requests)).toContain('?parent=none')

    await panelOf(screen).getByRole('button', { name: 'All issues' }).click()
    await expect
      .poll(() => router.state.location.search)
      .toEqual({ panel: 'epics' })
  })

  it('keeps the panel open when the filters are cleared', async () => {
    inProjects()
    const { screen, router } = await renderApp(`${PANEL}&epic=WEB-9`)

    await screen.getByRole('link', { name: 'Clear filters (1)' }).click()

    await expect
      .poll(() => router.state.location.search)
      .toEqual({ panel: 'epics' })
  })

  it('creates an epic from the panel', async () => {
    const created = {
      key: 'WEB-12',
      summary: 'Search revamp',
      child_count: 0,
      done_child_count: 0,
      done: false,
    }
    let posted = false
    const requests = inProjects({
      // The refetch after the create returns the new epic too.
      [BACKLOG]: {
        status: 200,
        body: () =>
          posted
            ? { ...WEB_BACKLOG, epics: [...WEB_BACKLOG.epics, created] }
            : WEB_BACKLOG,
      },
      'POST /api/projects/WEB/issues': {
        status: 201,
        body: issue({
          key: 'WEB-12',
          summary: 'Search revamp',
          issue_type: 'epic',
          sprint_id: null,
        }),
      },
    })
    const { screen } = await renderApp(PANEL)

    await panelOf(screen).getByRole('button', { name: 'Create epic' }).click()
    await panelOf(screen)
      .getByRole('textbox', { name: 'New epic summary' })
      .fill('Search revamp')
    posted = true
    await userEvent.keyboard('{Enter}')

    await expect
      .poll(() => bodiesOf(requests, 'POST /api/projects/WEB/issues'))
      .toEqual([{ summary: 'Search revamp', issue_type: 'epic' }])
    await expect
      .element(epicLink(screen, 'WEB-12'))
      .toHaveTextContent('Search revamp0 issues · 0 done')
    await expect
      .element(screen.getByRole('region', { name: 'Backlog' }))
      .not.toHaveTextContent('Search revamp')
  })

  it('sends one epic create for a repeated Enter', async () => {
    const requests = inProjects({ 'POST /api/projects/WEB/issues': pending })
    const { screen } = await renderApp(PANEL)

    await panelOf(screen).getByRole('button', { name: 'Create epic' }).click()
    await panelOf(screen)
      .getByRole('textbox', { name: 'New epic summary' })
      .fill('Search revamp')
    await userEvent.keyboard('{Enter}{Enter}{Enter}')

    expect(
      requests.filter((r) => routeOf(r) === 'POST /api/projects/WEB/issues')
    ).toHaveLength(1)

    await expect
      .element(
        panelOf(screen).getByRole('textbox', { name: 'New epic summary' })
      )
      .toHaveValue('')
  })

  it('drops a row onto an epic at once and takes it back when the server refuses', async () => {
    let answer = () => {}
    const requests = inProjects({
      'PATCH /api/projects/WEB/issues/6': {
        status: 422,
        body: problem(422, 'only an epic can be the parent'),
        until: new Promise<void>((resolve) => (answer = resolve)),
      },
    })
    const { screen } = await renderApp(PANEL)
    const handle = screen.getByRole('button', { name: 'Drag WEB-6' })
    await expect.element(handle).toBeVisible()
    await expect.element(epicLink(screen, 'WEB-9')).toBeVisible()
    ;(handle.element() as HTMLElement).focus()
    await userEvent.keyboard('[Space]')
    await expect.element(handle).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('[Space]')

    await expect
      .poll(() => bodiesOf(requests, 'PATCH /api/projects/WEB/issues/6'))
      .toEqual([{ parent: 'WEB-9' }])
    await expect
      .element(rowOf(screen, 'WEB-6'))
      .toHaveTextContent('Checkout revamp')
    await expect
      .element(epicLink(screen, 'WEB-9'))
      .toHaveTextContent('2 issues')

    answer()

    await expect
      .element(screen.getByText("Couldn't set the epic of WEB-6"))
      .toBeVisible()
    await expect
      .element(rowOf(screen, 'WEB-6'))
      .not.toHaveTextContent('Checkout revamp')
    await expect
      .element(epicLink(screen, 'WEB-9'))
      .toHaveTextContent('1 issue · 0 done')
  })

  it('sets and clears the epic from the row menu', async () => {
    const requests = inProjects({
      'PATCH /api/projects/WEB/issues/6': pending,
      'PATCH /api/projects/WEB/issues/4': pending,
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('button', { name: 'Actions for WEB-6' }).click()
    await screen.getByRole('menuitem', { name: 'Set epic' }).click()
    await screen
      .getByRole('menuitem', { name: 'WEB-9 Checkout revamp' })
      .click()

    await expect
      .poll(() => bodiesOf(requests, 'PATCH /api/projects/WEB/issues/6'))
      .toEqual([{ parent: 'WEB-9' }])
    await expect
      .element(rowOf(screen, 'WEB-6'))
      .toHaveTextContent('Checkout revamp')

    await screen.getByRole('button', { name: 'Actions for WEB-4' }).click()
    await screen.getByRole('menuitem', { name: 'Set epic' }).click()
    await screen.getByRole('menuitem', { name: 'No epic' }).click()

    await expect
      .poll(() => bodiesOf(requests, 'PATCH /api/projects/WEB/issues/4'))
      .toEqual([{ parent: null }])
    await expect
      .element(rowOf(screen, 'WEB-4'))
      .not.toHaveTextContent('Checkout revamp')
  })

  it('opens as a full-screen sheet on a phone, which a pick closes', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('button', { name: 'Epics' }).click()
    const sheet = screen.getByRole('dialog', { name: 'Epics' })
    await expect.element(sheet).toBeVisible()
    expect(sheet.element().getBoundingClientRect().width).toBeCloseTo(375, 0)
    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect.poll(() => router.state.location.search).toEqual({})

    await screen.getByRole('button', { name: 'Epics' }).click()

    await sheet.getByRole('button', { name: /^WEB-9 / }).click()

    await expect
      .poll(() => router.state.location.search)
      .toEqual({ epic: 'WEB-9' })
    await expect.element(sheet).not.toBeInTheDocument()
  })
})
