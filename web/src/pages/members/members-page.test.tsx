import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { MEMBERS, inProjects, problem, routeOf } from '@/test/stub-api'

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
      .toBeDisabled()
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
