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
  max_uses: 1,
  spots_left: 1,
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

  it.each([
    [
      410,
      'This invite link was already used.',
      'This invite link was already used. Ask for a new one.',
    ],
    [404, 'Not found.', 'This invite link does not exist. Ask for a new one.'],
  ])('says why joining failed (%i)', async (status, detail, alert) => {
    inProjects({
      ...preview,
      'POST /api/invites/tok123/accept': {
        status,
        body: problem(status, detail),
      },
    })
    const { screen } = await renderApp('/invites/tok123')

    await screen.getByRole('button', { name: 'Join project' }).click()

    await expect.element(screen.getByRole('alert')).toHaveTextContent(alert)
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
    await expect.element(offer).not.toHaveTextContent('spots left')
  })

  it("dates the expiry in the account's time zone", async () => {
    inProjects({
      ...preview,
      'GET /api/me': {
        status: 200,
        body: { ...ALICE, time_zone: 'Pacific/Auckland' },
      },
    })
    const { screen } = await renderApp('/invites/tok123')

    await expect
      .element(screen.getByRole('region', { name: 'Invite' }))
      .toHaveTextContent(/Expires\s*Oct 24, 2026/)
  })

  it('shows how many spots a group invite has left', async () => {
    inProjects({
      'GET /api/invites/tok123': {
        status: 200,
        body: { ...PREVIEW, max_uses: 5, spots_left: 3 },
      },
    })
    const { screen } = await renderApp('/invites/tok123')

    await expect
      .element(
        screen.getByRole('region', { name: 'Invite' }).getByText('3 of 5 spots left')
      )
      .toBeVisible()
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

  it('says the project is archived and offers no join', async () => {
    const detail =
      'This project is archived and read-only; an admin can unarchive it.'
    inProjects({
      'GET /api/invites/tok123': { status: 409, body: problem(409, detail) },
    })
    const { screen } = await renderApp('/invites/tok123')

    await expect.element(screen.getByRole('alert')).toHaveTextContent(detail)
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
      screen.getByRole('checkbox', { name: /I agree to the Terms of Use/ })
    )
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'I am 18 or older' })
    )
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
