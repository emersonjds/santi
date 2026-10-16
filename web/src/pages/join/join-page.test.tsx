import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  ALICE,
  MEMBERS,
  WEB,
  anonymous,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const PREVIEW = {
  project_key: 'WEB',
  project_name: 'Website',
  role: 'member',
  inviter_name: 'Bob Stone',
  expires_at: '2026-10-23T12:00:00Z',
}

const preview = { 'GET /api/invites/tok123': { status: 200, body: PREVIEW } }

describe('join a project', () => {
  it('asks an anonymous visitor to sign in, then comes back to the invite', async () => {
    anonymous({ 'POST /api/auth/login': { status: 200, body: ALICE } })
    const { screen, router } = await renderApp('/invites/tok123')

    await expect
      .element(screen.getByRole('heading', { name: 'Sign in' }))
      .toBeVisible()
    expect(router.state.location.search).toEqual({
      redirect: '/invites/tok123',
    })
    await screen.getByLabelText('Email').fill('alice@example.com')
    await screen.getByLabelText('Password').fill('correct horse battery')
    await screen.getByRole('button', { name: 'Sign in' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Join a project' }))
      .toBeVisible()
  })

  it('joins and opens the project', async () => {
    const requests = inProjects({
      ...preview,
      'POST /api/invites/tok123/accept': { status: 200, body: WEB },
      'GET /api/projects/WEB/members': { status: 200, body: MEMBERS },
    })
    const { screen, router } = await renderApp('/invites/tok123')

    await screen.getByRole('button', { name: 'Join project' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Website' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/board')
    expect(requests.map(routeOf)).toContain('POST /api/invites/tok123/accept')
  })

  it('says when the link is used or expired', async () => {
    inProjects({
      ...preview,
      'POST /api/invites/tok123/accept': {
        status: 404,
        body: problem(404, 'Not found.'),
      },
    })
    const { screen } = await renderApp('/invites/tok123')

    await screen.getByRole('button', { name: 'Join project' }).click()

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(
        'This invite link was already used or has expired. Ask for a new one.'
      )
  })

  it('shows what the invite offers before joining', async () => {
    inProjects(preview)
    const { screen } = await renderApp('/invites/tok123')

    const offer = screen.getByRole('region', { name: 'Invite' })
    await expect.element(offer).toHaveTextContent('Website')
    await expect.element(offer).toHaveTextContent(/Role\s*Member/)
    await expect.element(offer).toHaveTextContent(/Invited by\s*Bob Stone/)
    await expect.element(offer).toHaveTextContent(
      new Date(PREVIEW.expires_at).toLocaleDateString(undefined, {
        dateStyle: 'medium',
      })
    )
  })

  it.each([
    ['This invite link was already used.'],
    ['This invite link has expired.'],
  ])('says "%s" and offers no join', async (detail) => {
    inProjects({
      'GET /api/invites/tok123': { status: 410, body: problem(410, detail) },
    })
    const { screen } = await renderApp('/invites/tok123')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(`${detail} Ask for a new one.`)
    expect(
      screen.getByRole('button', { name: 'Join project' }).elements()
    ).toHaveLength(0)
  })

  it('says when the link does not exist', async () => {
    inProjects()
    const { screen } = await renderApp('/invites/tok123')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('This invite link does not exist. Ask for a new one.')
  })

  it('brings a new user back to the invite after creating an account', async () => {
    anonymous({
      ...preview,
      'POST /api/auth/register': { status: 201, body: ALICE },
    })
    const { screen, router } = await renderApp('/invites/tok123')

    await screen.getByRole('link', { name: 'Create an account' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'Create an account' }))
      .toBeVisible()
    expect(router.state.location.search).toEqual({
      redirect: '/invites/tok123',
    })
    await screen.getByLabelText('Name').fill('Alice')
    await screen.getByLabelText('Email').fill('alice@example.com')
    await screen
      .getByLabelText('Password', { exact: true })
      .fill('correct horse battery')
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' })
    )

    await expect
      .element(screen.getByRole('region', { name: 'Invite' }))
      .toHaveTextContent('Website')
    expect(router.state.location.pathname).toBe('/invites/tok123')
  })

  it('keeps the way back when switching from sign-up to sign-in', async () => {
    anonymous()
    const { screen, router } = await renderApp(
      '/register?redirect=%2Finvites%2Ftok123'
    )

    await screen.getByRole('link', { name: 'Sign in' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Sign in' }))
      .toBeVisible()
    expect(router.state.location.search).toEqual({
      redirect: '/invites/tok123',
    })
  })
})
