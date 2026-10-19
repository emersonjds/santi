import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import type { InviteInfo } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import { MEMBERS, WEB, inProjects, problem, routeOf } from '@/test/stub-api'

const BOB = MEMBERS[1]
const ADMINS = MEMBERS.map((member) => ({ ...member, role: 'admin' }))

const bodyOf = (requests: Request[], route: string) =>
  requests
    .find((request) => routeOf(request) === route)
    ?.clone()
    .json()

describe('members page', () => {
  it('opens from the members popover for an admin', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    await screen.getByRole('button', { name: 'Members: 2' }).click()
    await screen.getByRole('link', { name: 'Manage members' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Members' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/settings/members')
    await expect
      .element(screen.getByRole('button', { name: 'Invite' }).first())
      .toBeVisible()
  })

  it('changes a role and removes a member after asking', async () => {
    let members = MEMBERS
    const requests = inProjects({
      'GET /api/projects/WEB/members': { status: 200, body: () => members },
      'PUT /api/projects/WEB/members/2': {
        status: 200,
        body: () => {
          members = [MEMBERS[0], { ...BOB, role: 'admin' }]
          return members[1]
        },
      },
      'DELETE /api/projects/WEB/members/2': {
        status: 204,
        body: () => {
          members = [MEMBERS[0]]
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/settings/members')

    const role = screen.getByRole('combobox', { name: 'Role of Bob Stone' })
    await expect.element(role).toHaveValue('member')
    await role.selectOptions('admin')
    await expect
      .poll(() => bodyOf(requests, 'PUT /api/projects/WEB/members/2'))
      .toEqual({ role: 'admin' })
    await expect.element(role).toHaveValue('admin')

    await screen.getByRole('button', { name: 'Remove Bob Stone' }).click()
    const confirm = screen.getByRole('alertdialog')
    await expect.element(confirm).toHaveTextContent('Remove Bob Stone?')
    await confirm.getByRole('button', { name: 'Remove member' }).click()

    await expect.element(confirm).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('list', { name: 'Members' }))
      .not.toHaveTextContent('Bob Stone')
  })

  it('keeps the last admin: controls disabled with the reason', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/settings/members')

    await expect
      .element(screen.getByRole('combobox', { name: 'Role of Alice' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Remove Alice' }))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(screen.getByText('A project needs at least one admin.'))
      .toBeVisible()
  })

  it('shows the server refusal when a change would leave no admin', async () => {
    inProjects({
      'GET /api/projects/WEB/members': { status: 200, body: ADMINS },
      'PUT /api/projects/WEB/members/2': {
        status: 409,
        body: problem(409, 'A project needs at least one admin.'),
      },
      'DELETE /api/projects/WEB/members/2': {
        status: 409,
        body: problem(409, 'A project needs at least one admin.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/settings/members')

    await screen
      .getByRole('combobox', { name: 'Role of Bob Stone' })
      .selectOptions('member')
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('A project needs at least one admin.')

    await screen.getByRole('button', { name: 'Remove Bob Stone' }).click()
    const confirm = screen.getByRole('alertdialog')
    await confirm.getByRole('button', { name: 'Remove member' }).click()
    await expect
      .element(confirm.getByRole('alert'))
      .toHaveTextContent('A project needs at least one admin.')
  })

  it('sends an admin who removes themselves home with a word', async () => {
    inProjects({
      'GET /api/projects/WEB/members': { status: 200, body: ADMINS },
      'DELETE /api/projects/WEB/members/1': { status: 204 },
    })
    const { screen, router } = await renderApp('/p/WEB/settings/members')

    await screen.getByRole('button', { name: 'Remove Alice' }).click()
    await screen
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Remove member' })
      .click()

    await expect.element(screen.getByText('You left Website.')).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
  })

  it('sends an admin who steps down to the board with a word', async () => {
    inProjects({
      'GET /api/projects/WEB/members': { status: 200, body: ADMINS },
      'PUT /api/projects/WEB/members/1': {
        status: 200,
        body: { ...MEMBERS[0], role: 'member' },
      },
    })
    const { screen, router } = await renderApp('/p/WEB/settings/members')

    await screen
      .getByRole('combobox', { name: 'Role of Alice' })
      .selectOptions('member')

    await expect
      .element(screen.getByText('You are a member of Website now.'))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/board')
  })

  it('answers 403 to a member, who gets no link to it', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/settings/members')

    await expect
      .element(screen.getByText('Only project admins can change settings.'))
      .toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Members' }).elements()
    ).toHaveLength(0)
    await screen.getByRole('button', { name: 'Members: 2' }).click()
    await expect.element(screen.getByRole('dialog')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Manage members' }).elements()
    ).toHaveLength(0)
  })
})

const DAY = 86_400_000
const HOUR = 3_600_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const INVITES = 'GET /api/projects/WEB/invites'

const LINK: InviteInfo = {
  id: 7,
  role: 'member',
  max_uses: 3,
  uses: 2,
  created_by_name: 'Alice',
  created_at: ago(DAY),
  expires_at: ago(-5 * DAY - 60_000),
  joined: [
    {
      user_id: 2,
      name: 'Bob Stone',
      email: 'bob@example.com',
      joined_at: ago(2 * HOUR),
    },
    {
      user_id: 3,
      name: 'Cara Lee',
      email: 'cara@example.com',
      joined_at: ago(3 * HOUR),
    },
  ],
}

const ADMIN_LINK: InviteInfo = {
  ...LINK,
  id: 8,
  role: 'admin',
  max_uses: 1,
  uses: 0,
  joined: [],
}

describe('invite links (SAN-177)', () => {
  it('waits on a skeleton, then lists live links with spots and joiners', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => (answer = resolve))
    inProjects({ [INVITES]: { status: 200, body: [LINK, ADMIN_LINK], until } })
    const { screen } = await renderApp('/p/WEB/settings/members')

    await expect
      .element(screen.getByRole('status', { name: 'Loading invite links' }))
      .toBeVisible()
    answer()
    const links = screen.getByRole('list', { name: 'Invite links' })
    const member = links.getByRole('listitem').filter({ hasText: '2 of 3' })
    await expect.element(member).toHaveTextContent('Member')
    await expect.element(member).toHaveTextContent('2 of 3 spots used')
    await expect.element(member).toHaveTextContent('expires in 5 days')
    await expect.element(member).toHaveTextContent('by Alice')
    await expect.element(member).toHaveTextContent('Cara Lee')
    await expect.element(member).toHaveTextContent('cara@example.com')
    await expect.element(member).toHaveTextContent('2 hours ago')
    await expect.element(links).toHaveTextContent('Admin')
    await expect.element(links).toHaveTextContent('0 of 1 spot used')
  })

  it('says when no link is live', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/settings/members')

    await expect
      .element(screen.getByText('No active invite links.'))
      .toBeVisible()
  })

  it('offers a retry when the links do not load', async () => {
    inProjects({ [INVITES]: { status: 500, body: problem(500, 'Down.') } })
    const { screen } = await renderApp('/p/WEB/settings/members')

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Invite links did not load.')
    inProjects({ [INVITES]: { status: 200, body: [LINK] } })
    await screen.getByRole('button', { name: 'Try again' }).click()

    await expect
      .element(screen.getByRole('list', { name: 'Invite links' }))
      .toHaveTextContent('2 of 3 spots used')
  })

  it('revokes a link after asking: the row leaves with a word', async () => {
    let invites = [LINK, ADMIN_LINK]
    inProjects({
      [INVITES]: { status: 200, body: () => invites },
      'DELETE /api/projects/WEB/invites/7': {
        status: 204,
        body: () => {
          invites = [ADMIN_LINK]
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/settings/members')
    const links = screen.getByRole('list', { name: 'Invite links' })

    await links
      .getByRole('listitem')
      .filter({ hasText: '2 of 3' })
      .getByRole('button', { name: 'Revoke' })
      .click()
    const confirm = screen.getByRole('alertdialog')
    await expect.element(confirm).toHaveTextContent('Revoke this link?')
    await expect
      .element(confirm)
      .toHaveTextContent(
        'Nobody else can join with it. People who already joined stay in the project.'
      )
    await confirm.getByRole('button', { name: 'Revoke link' }).click()

    await expect.element(confirm).not.toBeInTheDocument()
    await expect.element(screen.getByText('Link revoked.')).toBeVisible()
    await expect.element(links).not.toHaveTextContent('2 of 3')
    await expect.element(links).toHaveTextContent('0 of 1 spot used')
    await expect
      .element(links.getByRole('button', { name: 'Revoke' }))
      .toHaveFocus()
  })

  it('drops a link that already ended when revoked', async () => {
    let invites = [LINK]
    inProjects({
      [INVITES]: { status: 200, body: () => invites },
      'DELETE /api/projects/WEB/invites/7': {
        status: 404,
        body: () => {
          invites = []
          return problem(404, 'Invite not found.')
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/settings/members')

    await screen.getByRole('button', { name: 'Revoke' }).click()
    await screen
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Revoke link' })
      .click()

    await expect
      .element(screen.getByText('No active invite links.'))
      .toBeVisible()
    expect(screen.getByRole('alertdialog').elements()).toEqual([])
    await expect
      .element(screen.getByRole('heading', { name: 'Invite links' }))
      .toHaveFocus()
  })

  it('keeps the row and shows the refusal when the server says no', async () => {
    inProjects({
      [INVITES]: { status: 200, body: [LINK] },
      'DELETE /api/projects/WEB/invites/7': {
        status: 409,
        body: problem(409, 'This project is archived.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/settings/members')

    await screen.getByRole('button', { name: 'Revoke' }).click()
    const confirm = screen.getByRole('alertdialog')
    await confirm.getByRole('button', { name: 'Revoke link' }).click()

    await expect
      .element(confirm.getByRole('alert'))
      .toHaveTextContent('This project is archived.')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect
      .element(screen.getByRole('list', { name: 'Invite links' }))
      .toHaveTextContent('2 of 3 spots used')
    await expect
      .element(screen.getByRole('button', { name: 'Revoke' }))
      .toHaveFocus()
  })

  it('keeps the links readable but Revoke locked when archived', async () => {
    inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived' },
      },
      [INVITES]: { status: 200, body: [LINK] },
    })
    const { screen } = await renderApp('/p/WEB/settings/members')

    const revoke = screen.getByRole('button', { name: 'Revoke' })
    await expect.element(revoke).toHaveAttribute('aria-disabled', 'true')
    await revoke.click({ force: true })
    expect(screen.getByRole('alertdialog').elements()).toEqual([])
  })

  it('is not asked for on a project where the caller is a member', async () => {
    const requests = inProjects()
    const { screen } = await renderApp('/p/OPS/settings/members')

    await expect
      .element(screen.getByText('Only project admins can change settings.'))
      .toBeVisible()
    expect(screen.getByText('Invite links').elements()).toEqual([])
    expect(
      requests.map(routeOf).filter((route) => route.endsWith('/invites'))
    ).toEqual([])
  })

  it('shows a new link once it is created', async () => {
    let invites: InviteInfo[] = []
    inProjects({
      [INVITES]: { status: 200, body: () => invites },
      'POST /api/projects/WEB/invites': {
        status: 201,
        body: () => {
          invites = [ADMIN_LINK]
          return {
            token: 'abc',
            max_uses: 1,
            expires_at: ADMIN_LINK.expires_at,
          }
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/settings/members')

    await expect
      .element(screen.getByText('No active invite links.'))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Invite' }).last().click()
    await screen.getByRole('button', { name: 'Create invite link' }).click()
    await expect
      .element(screen.getByLabelText('Invite link', { exact: true }))
      .toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect
      .element(screen.getByRole('list', { name: 'Invite links' }))
      .toHaveTextContent('0 of 1 spot used')
  })
})
