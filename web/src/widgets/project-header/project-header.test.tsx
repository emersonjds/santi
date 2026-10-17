import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { OPS, WEB, inProjects, problem, routeOf } from '@/test/stub-api'

const INVITE = { token: 'tok123', expires_at: '2026-10-23T12:00:00Z' }

describe('project header', () => {
  it('shows the project with a breadcrumb and its views as tabs', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')

    await expect
      .element(screen.getByRole('heading', { name: 'Website' }))
      .toBeVisible()
    const tabs = screen.getByRole('navigation', { name: 'Project views' })
    await expect
      .element(tabs.getByRole('link', { name: 'Board' }))
      .toHaveAttribute('aria-current', 'page')
    await tabs.getByRole('link', { name: 'Backlog' }).click()
    await expect
      .element(tabs.getByRole('link', { name: 'Backlog' }))
      .toHaveAttribute('aria-current', 'page')
    await screen
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Projects' })
      .click()
    await expect
      .element(screen.getByRole('heading', { name: 'For you' }))
      .toBeVisible()
  })

  it('sends a kanban backlog to the board', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/OPS/backlog')

    await expect
      .element(screen.getByRole('region', { name: 'Board' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/OPS/board')
    expect(
      screen
        .getByRole('navigation', { name: 'Project views' })
        .getByRole('link', { name: 'Backlog' })
        .elements()
    ).toHaveLength(0)
  })

  it('shows Reports after Backlog on scrum only, and sends kanban reports to the board', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    const tabs = screen.getByRole('navigation', { name: 'Project views' })
    await expect
      .element(tabs.getByRole('link', { name: 'Reports' }))
      .toHaveAttribute('href', '/p/WEB/reports')
    expect(
      tabs
        .getByRole('link')
        .elements()
        .map((tab) => tab.textContent)
    ).toEqual(['Board', 'Backlog', 'Reports', 'Settings'])

    await router.navigate({ to: '/p/$key/reports', params: { key: 'OPS' } })

    await expect
      .element(screen.getByRole('region', { name: 'Board' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/OPS/board')
    expect(tabs.getByRole('link', { name: 'Reports' }).elements()).toHaveLength(
      0
    )
  })

  it('lists the members with their roles', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/board')

    await screen.getByRole('button', { name: 'Members: 2' }).click()

    const list = screen.getByRole('dialog').getByRole('list')
    await expect.element(list).toHaveTextContent('Bob Stone')
    await expect.element(list).toHaveTextContent('bob@example.com')
    await expect.element(list).toHaveTextContent('Member')
    await expect.element(list).toHaveTextContent('Admin')
    expect(
      screen.getByRole('button', { name: 'Invite' }).elements()
    ).toHaveLength(0)
  })

  it('shows five member avatars and counts the rest', async () => {
    const team = Array.from({ length: 7 }, (_, index) => ({
      user_id: index + 1,
      email: `person${index}@example.com`,
      display_name: `Person ${index}`,
      role: 'member',
    }))
    inProjects({ 'GET /api/projects/OPS/members': { status: 200, body: team } })
    const { screen } = await renderApp('/p/OPS/board')

    await expect
      .element(screen.getByRole('button', { name: 'Members: 7' }))
      .toHaveTextContent('+2')
  })

  it('lets an admin create an invite link and copy it', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const requests = inProjects({
      'POST /api/projects/WEB/invites': { status: 201, body: INVITE },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await screen.getByRole('button', { name: 'Invite' }).click()
    await screen.getByLabelText('Invite as').selectOptions('admin')
    await screen.getByRole('button', { name: 'Create invite link' }).click()

    const link = `${location.origin}/invites/tok123`
    await expect
      .element(screen.getByRole('textbox', { name: 'Invite link' }))
      .toHaveValue(link)
    await expect.element(screen.getByText(/Works once\. Expires/)).toBeVisible()
    await screen.getByRole('button', { name: 'Copy link' }).click()
    await expect
      .element(screen.getByRole('button', { name: 'Copied' }))
      .toBeVisible()
    expect(copy).toHaveBeenCalledWith(link)
    const post = requests.find(
      (request) => routeOf(request) === 'POST /api/projects/WEB/invites'
    )
    expect(await post?.json()).toEqual({ role: 'admin' })
  })

  it('shows why an invite link was refused', async () => {
    inProjects({
      'POST /api/projects/WEB/invites': {
        status: 403,
        body: problem(403, 'Only project admins can invite.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    await screen.getByRole('button', { name: 'Invite' }).click()
    await screen.getByRole('button', { name: 'Create invite link' }).click()

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Only project admins can invite.')
  })

  it('marks an archived project read-only and lets an admin unarchive it', async () => {
    let state = 'archived'
    const requests = inProjects({
      'GET /api/projects/WEB': { status: 200, body: () => ({ ...WEB, state }) },
      'POST /api/projects/WEB/unarchive': {
        status: 204,
        body: () => void (state = 'active'),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    const banner = screen.getByRole('status').filter({
      hasText: 'This project is archived and read-only',
    })
    await expect.element(banner).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Invite' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByRole('button', { name: 'Create issue' }).first())
      .toHaveAttribute('aria-disabled', 'true')
    await banner.getByRole('button', { name: 'Unarchive' }).click()

    await expect.element(banner).not.toBeInTheDocument()
    expect(requests.map(routeOf)).toContain('POST /api/projects/WEB/unarchive')
    await expect
      .element(screen.getByRole('button', { name: 'Create issue' }).first())
      .not.toHaveAttribute('aria-disabled')
    await expect
      .element(screen.getByRole('button', { name: 'Invite' }))
      .not.toHaveAttribute('aria-disabled')
  })

  it('shows members the archived banner without Unarchive', async () => {
    inProjects({
      'GET /api/projects/OPS': {
        status: 200,
        body: { ...OPS, state: 'archived' },
      },
    })
    const { screen } = await renderApp('/p/OPS/board')

    const banner = screen.getByRole('status').filter({
      hasText: 'This project is archived and read-only',
    })
    await expect.element(banner).toBeVisible()
    expect(
      banner.getByRole('button', { name: 'Unarchive' }).elements()
    ).toEqual([])
  })
})
