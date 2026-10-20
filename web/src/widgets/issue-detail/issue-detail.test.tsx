import Markdown from 'react-markdown'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Comment } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  MEMBERS,
  WEB,
  WEB_COMMENTS,
  WEB_ISSUE,
  inProjects,
  issue,
  problem,
  routeOf,
} from '@/test/stub-api'

vi.mock('react-markdown', { spy: true })

const PATCH = 'PATCH /api/projects/WEB/issues/1'
const MOVE = 'POST /api/projects/WEB/issues/1/move'
const COMMENT = 'POST /api/projects/WEB/issues/1/comments'
const CREATE = 'POST /api/projects/WEB/issues'
const pending = { status: 200, body: {}, until: new Promise(() => {}) }

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const openFromBoard = async (replies = {}) => {
  const requests = inProjects(replies)
  const app = await renderApp('/p/WEB/board')
  await app.screen
    .getByRole('link', { name: 'Write the release notes' })
    .click()
  const dialog = app.screen.getByRole('dialog', { name: 'WEB-1' })
  await expect.element(dialog.getByLabelText('Summary')).toBeVisible()
  return { ...app, requests, dialog }
}

const firstCard = (screen: RenderResult) =>
  screen.getByRole('region', { name: 'To do' }).getByRole('article').first()

describe('issue detail', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('opens a card in a dialog over the board under the issue URL; Esc goes back', async () => {
    const { dialog, router, screen } = await openFromBoard()

    await expect
      .element(dialog.getByLabelText('Summary'))
      .toHaveValue('Write the release notes')
    expect(router.state.location.maskedLocation?.pathname).toBe(
      '/p/WEB/issues/1'
    )

    await userEvent.keyboard('{Escape}')

    await expect.element(dialog).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/p/WEB/board')
    expect(router.state.location.search).toEqual({})
    await expect.element(firstCard(screen)).toBeVisible()
  })

  it('records a view when the issue opens over the board', async () => {
    const { requests } = await openFromBoard()

    await expect
      .poll(
        () =>
          requests.filter(
            (request) =>
              routeOf(request) === 'POST /api/projects/WEB/issues/1/view'
          ).length
      )
      .toBe(1)
  })

  it('records a view when the issue page loads directly', async () => {
    const requests = inProjects()
    await renderApp('/p/WEB/issues/1')

    await expect
      .poll(
        () =>
          requests.filter(
            (request) =>
              routeOf(request) === 'POST /api/projects/WEB/issues/1/view'
          ).length
      )
      .toBe(1)
  })

  it('shows the full page when the issue URL is loaded directly', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')

    await expect
      .element(screen.getByLabelText('Summary'))
      .toHaveValue('Write the release notes')
    expect(screen.getByRole('dialog').elements()).toHaveLength(0)
    await expect.element(screen.getByText('Then the backlog.')).toBeVisible()
    await expect.element(screen.getByLabelText('Status')).toHaveValue('10')
    await expect.element(screen.getByLabelText('Sprint')).toHaveValue('4')
    await expect
      .element(screen.getByRole('button', { name: 'Remove label docs' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('region', { name: 'Details' }))
      .toHaveTextContent(/Reporter\s*Alice/)
    const comment = screen
      .getByRole('region', { name: 'Comments' })
      .getByRole('article')
    await expect.element(comment).toHaveTextContent('Bob Stone')
    await expect.element(comment).toHaveTextContent('2 hours ago')
    await expect
      .element(comment)
      .toHaveTextContent('Draft is in the shared doc.')
  })

  it('renders the description and comments as Markdown with mention chips', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/1': {
        status: 200,
        body: {
          ...WEB_ISSUE,
          description: '**Ship** it\nwith [@Bobby](mention:2)',
        },
      },
      'GET /api/projects/WEB/issues/1/comments': {
        status: 200,
        body: {
          items: [
            { ...WEB_COMMENTS[0], body: 'Ping [@Al](mention:1) on _Friday_' },
          ],
          next_cursor: null,
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const description = screen.getByRole('region', { name: 'Description' })
    await expect.element(description.getByText('Ship')).toBeVisible()
    expect(description.getByText('Ship').element().tagName).toBe('STRONG')
    await expect
      .element(description.getByText('Bob Stone', { exact: true }))
      .toBeVisible()
    const comment = screen
      .getByRole('region', { name: 'Comments' })
      .getByRole('article')
    await expect
      .element(comment.getByText('Alice', { exact: true }))
      .toBeVisible()
    expect(comment.getByText('Friday').element().tagName).toBe('EM')
  })

  it('shows people by first and last name, the full name on hover', async () => {
    const full = 'Emerson Junior Daniel Silva'
    const [reporter, author] = MEMBERS
    inProjects({
      'GET /api/projects/WEB/members': {
        status: 200,
        body: [
          { ...reporter, display_name: 'EMERSON JUNIOR DANIEL SILVA' },
          { ...author, display_name: 'Ana McDonald da Silva' },
        ],
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const details = screen.getByRole('region', { name: 'Details' })
    await expect.element(details).toHaveTextContent(/Reporter\s*Emerson Silva/)
    await expect
      .element(details.getByTitle(full).last())
      .toHaveTextContent('Emerson Silva')
    await expect
      .element(screen.getByRole('option', { name: 'Emerson Silva' }))
      .toHaveAttribute('title', full)
    const comment = screen
      .getByRole('region', { name: 'Comments' })
      .getByRole('article')
    await expect
      .element(comment.getByText('Ana Silva'))
      .toHaveAttribute('title', 'Ana McDonald da Silva')
    await expect
      .element(comment.getByTitle('Ana McDonald da Silva').first())
      .toHaveTextContent('AS')
  })

  it('answers an unknown issue with the not-found page', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/99': {
        status: 404,
        body: problem(404, 'Not found.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/99')

    await expect
      .element(screen.getByRole('heading', { name: 'Page not found' }))
      .toBeVisible()
  })

  it('edits the priority at once and the card behind follows', async () => {
    const { dialog, requests, screen } = await openFromBoard({
      [PATCH]: pending,
    })

    await expect.element(dialog.getByTitle('Medium priority')).toBeVisible()
    await dialog.getByLabelText('Priority').selectOptions('High')
    await expect.element(dialog.getByTitle('High priority')).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect
      .element(firstCard(screen).getByText('High priority'))
      .toBeInTheDocument()
    await expect
      .poll(() => bodiesOf(requests, PATCH))
      .toEqual([{ priority: 'high' }])
  })

  it('moves the issue when its status changes', async () => {
    const { dialog, requests, screen } = await openFromBoard({
      [MOVE]: pending,
    })

    await dialog.getByLabelText('Status').selectOptions('In review')
    await userEvent.keyboard('{Escape}')

    await expect
      .element(screen.getByRole('region', { name: 'In progress' }))
      .toHaveTextContent('Write the release notes')
    await expect
      .poll(() => bodiesOf(requests, MOVE))
      .toEqual([{ status_id: 21 }])
  })

  it('rolls a refused type change back and says why next to the field', async () => {
    inProjects({
      [PATCH]: {
        status: 422,
        body: problem(422, 'Check the fields.', [
          {
            field: 'issue_type',
            message: 'only stories, tasks and bugs can change type',
          },
        ]),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await screen.getByLabelText('Type').selectOptions('Epic')

    await expect
      .element(screen.getByText('only stories, tasks and bugs can change type'))
      .toBeVisible()
    await expect.element(screen.getByLabelText('Type')).toHaveValue('story')
    await expect
      .element(screen.getByText("Couldn't update WEB-1"))
      .toBeVisible()
  })

  it('keeps a subtask in its parent sprint and links the parent', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/3': {
        status: 200,
        body: issue({
          key: 'WEB-3',
          summary: 'Keep the redirect target',
          issue_type: 'subtask',
          parent_key: 'WEB-2',
        }),
      },
      'GET /api/projects/WEB/issues/3/comments': {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      'PATCH /api/projects/WEB/issues/3': {
        status: 422,
        body: problem(422, 'Check the fields.', [
          {
            field: 'sprint_id',
            message: "a subtask follows its parent's sprint",
          },
        ]),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/3')

    await expect
      .element(screen.getByRole('link', { name: 'WEB-2' }))
      .toHaveAttribute('href', expect.stringMatching(/\/p\/WEB\/issues\/2$/))
    expect(
      screen.getByRole('button', { name: 'Add subtask' }).elements()
    ).toHaveLength(0)
    expect(screen.getByLabelText('Epic').elements()).toHaveLength(0)
    await screen.getByLabelText('Sprint').selectOptions('Sprint 5')

    await expect
      .element(screen.getByText("a subtask follows its parent's sprint"))
      .toBeVisible()
    await expect.element(screen.getByLabelText('Sprint')).toHaveValue('4')
  })

  it('saves the summary, description and every detail field on change', async () => {
    const requests = inProjects({
      [PATCH]: pending,
      'GET /api/projects/WEB/issues': {
        status: 200,
        body: {
          items: [
            issue({
              key: 'WEB-9',
              summary: 'Checkout revamp',
              issue_type: 'epic',
            }),
          ],
          next_cursor: null,
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const summary = screen.getByLabelText('Summary')
    await summary.fill('Write the v1 notes')
    await userEvent.keyboard('{Enter}')
    await screen.getByRole('button', { name: 'Edit description' }).click()
    await expect
      .element(screen.getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()
    await screen
      .getByRole('textbox', { name: 'Description' })
      .fill('Only the board.')
    await screen.getByRole('button', { name: 'Save' }).click()
    await expect.element(screen.getByText('Only the board.')).toBeVisible()
    await screen.getByLabelText('Assignee').selectOptions('Bob Stone')
    await screen.getByRole('button', { name: 'Assign to me' }).click()
    await screen.getByLabelText('Assignee').selectOptions('Unassigned')
    await screen.getByLabelText('Points').fill('5')
    await userEvent.keyboard('{Enter}')
    await screen.getByRole('button', { name: 'Add label' }).click()
    await userEvent.keyboard('release{Enter}{Escape}')
    await screen.getByLabelText('Epic').selectOptions('WEB-9 Checkout revamp')
    await screen.getByLabelText('Sprint').selectOptions('Backlog')

    await expect
      .poll(() => bodiesOf(requests, PATCH))
      .toEqual([
        { summary: 'Write the v1 notes' },
        { description: 'Only the board.' },
        { assignee_id: 2 },
        { assignee_id: 1 },
        { assignee_id: null },
        { points: 5 },
        { labels: ['docs', 'release'] },
        { parent: 'WEB-9' },
        { sprint_id: null },
      ])
    await expect
      .element(screen.getByLabelText('Summary'))
      .toHaveValue('Write the v1 notes')
  })

  it('adds a comment at once', async () => {
    const requests = inProjects({ [COMMENT]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await screen.getByRole('button', { name: 'Add a comment…' }).click()
    await expect
      .element(screen.getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()
    await userEvent.keyboard('Ship it on Friday.')
    await screen.getByRole('button', { name: 'Save' }).click()

    const comments = screen
      .getByRole('region', { name: 'Comments' })
      .getByRole('article')
    await expect.element(comments.nth(1)).toHaveTextContent('Alice')
    await expect
      .element(comments.nth(1))
      .toHaveTextContent('Ship it on Friday.')
    await expect
      .element(screen.getByRole('button', { name: 'Add a comment…' }))
      .toHaveFocus()
    await expect
      .poll(() => bodiesOf(requests, COMMENT))
      .toEqual([{ body: 'Ship it on Friday.' }])
  })

  it('lists subtasks and adds one inline', async () => {
    const requests = inProjects({
      'GET /api/projects/WEB/issues': {
        status: 200,
        body: {
          items: [
            issue({
              key: 'WEB-3',
              summary: 'Keep the redirect target',
              issue_type: 'subtask',
              status_id: 20,
            }),
          ],
          next_cursor: null,
        },
      },
      [CREATE]: {
        status: 201,
        body: issue({
          key: 'WEB-9',
          summary: 'Check the logs',
          issue_type: 'subtask',
          parent_key: 'WEB-1',
        }),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const subtasks = screen.getByRole('region', { name: 'Subtasks' })
    await expect
      .element(subtasks.getByRole('listitem').first())
      .toHaveTextContent(/WEB-3.*Keep the redirect target.*In progress/)
    await subtasks.getByRole('button', { name: 'Add subtask' }).click()
    await subtasks.getByLabelText('Subtask summary').fill('Check the logs')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(subtasks.getByRole('link', { name: 'Check the logs' }))
      .toBeVisible()
    expect(await bodiesOf(requests, CREATE)).toEqual([
      { summary: 'Check the logs', issue_type: 'subtask', parent: 'WEB-1' },
    ])
  })

  it('sends one subtask create for a repeated Enter', async () => {
    const requests = inProjects({ [CREATE]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const subtasks = screen.getByRole('region', { name: 'Subtasks' })

    await subtasks.getByRole('button', { name: 'Add subtask' }).click()
    await subtasks.getByLabelText('Subtask summary').fill('Check the logs')
    await userEvent.keyboard('{Enter}{Enter}{Enter}')

    expect(requests.filter((r) => routeOf(r) === CREATE)).toHaveLength(1)

    await expect
      .element(subtasks.getByLabelText('Subtask summary'))
      .toHaveValue('')
  })

  it('drops an open subtask field on Esc or Cancel, leaving the dialog open', async () => {
    const { dialog } = await openFromBoard()
    const subtasks = dialog.getByRole('region', { name: 'Subtasks' })

    await subtasks.getByRole('button', { name: 'Add subtask' }).click()
    await subtasks.getByLabelText('Subtask summary').fill('Half a thought')
    await userEvent.keyboard('{Escape}')

    await expect
      .element(subtasks.getByLabelText('Subtask summary'))
      .not.toBeInTheDocument()
    await expect.element(dialog).toBeVisible()

    await subtasks.getByRole('button', { name: 'Add subtask' }).click()
    await expect
      .element(subtasks.getByLabelText('Subtask summary'))
      .toHaveValue('')
    await subtasks.getByRole('button', { name: 'Cancel' }).click()
    await expect
      .element(subtasks.getByRole('button', { name: 'Add subtask' }))
      .toBeVisible()
  })

  it('keeps the summary when it is emptied, and drops a cancelled description', async () => {
    const requests = inProjects({ [PATCH]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await screen.getByLabelText('Summary').fill('')
    await userEvent.keyboard('{Tab}')
    await screen.getByRole('button', { name: 'Edit description' }).click()
    await screen
      .getByRole('textbox', { name: 'Description' })
      .fill('Never mind.')
    await screen.getByRole('button', { name: 'Cancel' }).click()

    await expect
      .element(screen.getByLabelText('Summary'))
      .toHaveValue('Write the release notes')
    await expect.element(screen.getByText('Then the backlog.')).toBeVisible()
    expect(await bodiesOf(requests, PATCH)).toEqual([])
  })

  it('copies the link to the issue page', async () => {
    inProjects()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { screen } = await renderApp('/p/WEB/issues/1')

    await screen.getByRole('button', { name: 'Copy link' }).click()

    await expect.element(screen.getByText('Link copied')).toBeVisible()
    expect(copy).toHaveBeenCalledWith(
      expect.stringMatching(/\/p\/WEB\/issues\/1$/)
    )
  })

  it('opens from a board link and closes onto the bare board', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/7': {
        status: 500,
        body: problem(500, 'The database is away.'),
      },
    })
    const { screen, router } = await renderApp('/p/WEB/board?issue=7')

    await expect
      .element(screen.getByRole('dialog', { name: 'WEB-7' }))
      .toHaveTextContent("Couldn't open WEB-7: The database is away.")
    await userEvent.keyboard('{Escape}')

    await expect.poll(() => router.state.location.search).toEqual({})
    expect(router.state.location.pathname).toBe('/p/WEB/board')
  })

  it('answers a malformed issue number with the not-found page, and a failure with the error page', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/8': {
        status: 500,
        body: problem(500, 'The database is away.'),
      },
    })
    const { screen, router } = await renderApp('/p/WEB/issues/abc')

    await expect
      .element(screen.getByRole('heading', { name: 'Page not found' }))
      .toBeVisible()
    await router.navigate({
      to: '/p/$key/issues/$number',
      params: { key: 'WEB', number: '8' },
    })
    await expect
      .element(screen.getByRole('heading', { name: 'Something went wrong' }))
      .toBeVisible()
  })

  it('deletes the issue from its menu and closes onto the board once it lands', async () => {
    let answer = (_: unknown) => {}
    const { dialog, router, screen } = await openFromBoard({
      'DELETE /api/projects/WEB/issues/1': {
        status: 204,
        until: new Promise((resolve) => (answer = resolve)),
      },
    })

    await dialog.getByRole('button', { name: 'More actions' }).click()
    await screen.getByRole('menuitem', { name: 'Delete' }).click()
    await screen
      .getByRole('alertdialog', { name: 'Delete WEB-1?' })
      .getByRole('button', { name: 'Delete issue' })
      .click()
    await expect
      .element(screen.getByRole('alertdialog'))
      .not.toBeInTheDocument()
    await expect.element(dialog).toBeVisible()
    answer(undefined)

    await expect.element(dialog).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/p/WEB/board')
    expect(router.state.location.search).toEqual({})
    await expect.element(screen.getByText('WEB-1 deleted')).toBeVisible()
  })

  it('has no delete for a member on an issue someone else reported', async () => {
    inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, role: 'member' },
      },
      'GET /api/projects/WEB/issues/1': {
        status: 200,
        body: issue({ key: 'WEB-1', summary: 'Plan', reporter_id: 2 }),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await expect.element(screen.getByLabelText('Summary')).toHaveValue('Plan')
    await expect
      .element(screen.getByRole('button', { name: 'Copy link' }))
      .toBeVisible()
    expect(
      screen.getByRole('button', { name: 'More actions' }).elements()
    ).toHaveLength(0)
  })

  it('stays on the issue page until the delete lands, and after a refusal', async () => {
    let answer = (_: unknown) => {}
    inProjects({
      'DELETE /api/projects/WEB/issues/1': {
        status: 403,
        body: problem(403, 'You are not allowed to do this.'),
        until: new Promise((resolve) => (answer = resolve)),
      },
    })
    const { router, screen } = await renderApp('/p/WEB/issues/1')

    await screen.getByRole('button', { name: 'More actions' }).click()
    await screen.getByRole('menuitem', { name: 'Delete' }).click()
    await screen
      .getByRole('alertdialog', { name: 'Delete WEB-1?' })
      .getByRole('button', { name: 'Delete issue' })
      .click()
    expect(router.state.location.pathname).toBe('/p/WEB/issues/1')
    answer(undefined)

    await expect
      .element(screen.getByText('You are not allowed to do this.'))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/issues/1')
  })

  it('leaves the issue page for the board once the issue is deleted, saying so', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/1': {
        status: 200,
        body: issue({ key: 'WEB-1', summary: 'Plan', issue_type: 'epic' }),
      },
      'DELETE /api/projects/WEB/issues/1': { status: 204 },
    })
    const { router, screen } = await renderApp('/p/WEB/issues/1')

    await screen.getByRole('button', { name: 'More actions' }).click()
    await screen.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = screen.getByRole('alertdialog', { name: 'Delete WEB-1?' })
    await expect
      .element(confirm)
      .toHaveTextContent('Its issues stay, without an epic.')
    await confirm.getByRole('button', { name: 'Delete issue' }).click()

    await expect.element(screen.getByText('WEB-1 deleted')).toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/board')
  })
})

describe('issue rich text', () => {
  beforeEach(() => page.viewport(1280, 800))

  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control'
  const mod = (keys: string) => `{${MOD}>}${keys}{/${MOD}}`
  // The picker ignores Enter for 75 ms after its list changes.
  const settled = () => new Promise((resolve) => setTimeout(resolve, 100))

  const editDescription = async (replies = {}) => {
    const requests = inProjects(replies)
    const { screen } = await renderApp('/p/WEB/issues/1')
    await screen.getByRole('button', { name: 'Edit description' }).click()
    const description = screen.getByRole('region', { name: 'Description' })
    await expect
      .element(description.getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()
    await expect
      .element(description.getByRole('textbox', { name: 'Description' }))
      .toHaveFocus()
    return { requests, screen, description }
  }

  it('saves the typed Markdown and a picked mention byte for byte with Mod-Enter', async () => {
    const text =
      'Cover the board.\nThen the backlog.\n**Ship** with [@Bob Stone](mention:2)'
    const { requests, description } = await editDescription({
      [PATCH]: { status: 200, body: { ...WEB_ISSUE, description: text } },
    })

    await userEvent.keyboard('{Enter}**Ship** with @bo')
    await expect
      .element(description.getByRole('option').first())
      .toHaveTextContent('Bob Stone')
    await settled()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(mod('{Enter}'))

    await expect
      .poll(() => bodiesOf(requests, PATCH))
      .toEqual([{ description: text }])
    await expect
      .element(description.getByRole('button', { name: 'Edit description' }))
      .toBeVisible()
  })

  it('keeps the draft under the error, then Esc drops it', async () => {
    const { requests, screen, description } = await editDescription({
      [PATCH]: {
        status: 422,
        body: problem(422, 'Check the fields.', [
          {
            field: 'description',
            message: 'must have at most 65536 characters',
          },
        ]),
      },
    })

    await userEvent.keyboard(' More.')
    await description.getByRole('button', { name: 'Save' }).click()

    await expect
      .element(screen.getByText('must have at most 65536 characters'))
      .toBeVisible()
    await expect
      .element(description.getByRole('textbox', { name: 'Description' }))
      .toHaveTextContent('Then the backlog. More.')
    await description.getByRole('textbox', { name: 'Description' }).click()
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByText('Then the backlog.')).toBeVisible()
    expect(
      description.getByRole('textbox', { name: 'Description' }).elements()
    ).toEqual([])
    expect(await bodiesOf(requests, PATCH)).toEqual([
      { description: 'Cover the board.\nThen the backlog. More.' },
    ])
  })

  it('opens the editor from a click on the text but not on a mention', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/1': {
        status: 200,
        body: {
          ...WEB_ISSUE,
          description: 'Ask [@Bobby](mention:2)\nThen ship.',
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const description = screen.getByRole('region', { name: 'Description' })

    await description.getByText('Bob Stone', { exact: true }).click()
    expect(description.getByRole('textbox').elements()).toEqual([])
    await description.getByText('Then ship.').click()

    await expect
      .element(description.getByRole('textbox', { name: 'Description' }))
      .toHaveFocus()
  })

  it('opens the editor from the empty state', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/1': {
        status: 200,
        body: { ...WEB_ISSUE, description: '' },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await screen.getByText('No description yet.').click()

    const description = screen.getByRole('region', { name: 'Description' })
    await expect
      .element(description.getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()
    await expect
      .element(description.getByRole('textbox', { name: 'Description' }))
      .toHaveFocus()
    await expect
      .element(description.getByText('Add a description…'))
      .toBeVisible()
  })

  it('posts a comment with a mention on Mod-Enter and lists it with the chip', async () => {
    const requests = inProjects({ [COMMENT]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = screen.getByRole('region', { name: 'Comments' })

    await comments.getByRole('button', { name: 'Add a comment…' }).click()
    await expect
      .element(comments.getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()
    await userEvent.keyboard('Ping @al')
    await expect
      .element(comments.getByRole('option').first())
      .toHaveTextContent('Alice')
    await settled()
    await userEvent.keyboard('{Enter}{Enter}Thanks')
    await userEvent.keyboard(mod('{Enter}'))

    await expect
      .poll(() => bodiesOf(requests, COMMENT))
      .toEqual([{ body: 'Ping [@Alice](mention:1)\nThanks' }])
    const posted = comments.getByRole('article').nth(1)
    await expect
      .element(posted.getByText('Alice', { exact: true }).last())
      .toBeVisible()
    await expect
      .element(comments.getByRole('button', { name: 'Add a comment…' }))
      .toHaveFocus()
  })

  it('keeps the draft through Esc and Cancel while the save is in flight, then under its error', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => {
      answer = resolve
    })
    const { screen, description } = await editDescription({
      [PATCH]: {
        status: 422,
        body: problem(422, 'Check the fields.', [
          {
            field: 'description',
            message: 'must have at most 65536 characters',
          },
        ]),
        until,
      },
    })
    const field = description.getByRole('textbox', { name: 'Description' })

    await userEvent.keyboard(' More.')
    await description.getByRole('button', { name: 'Save' }).click()
    await expect.element(field).toHaveAttribute('aria-readonly', 'true')
    await field.click()
    await userEvent.keyboard('{Escape}')
    await description.getByRole('button', { name: 'Cancel' }).click()
    answer()

    await expect
      .element(screen.getByText('must have at most 65536 characters'))
      .toBeVisible()
    await expect.element(field).toHaveTextContent('Then the backlog. More.')
  })

  it('drops the drafts of an issue when the view moves to another one', async () => {
    inProjects({
      'GET /api/projects/WEB/issues/3': {
        status: 200,
        body: issue({
          key: 'WEB-3',
          summary: 'Keep the redirect target',
          issue_type: 'subtask',
          parent_key: 'WEB-2',
          description: 'Child text',
        }),
      },
      'GET /api/projects/WEB/issues/3/comments': {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      'POST /api/projects/WEB/issues/3/view': { status: 204 },
      'GET /api/projects/WEB/issues/2': {
        status: 200,
        body: issue({
          key: 'WEB-2',
          summary: 'Fix the login redirect loop',
          description: 'Parent text',
        }),
      },
      'GET /api/projects/WEB/issues/2/comments': {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      'POST /api/projects/WEB/issues/2/view': { status: 204 },
    })
    const { screen } = await renderApp('/p/WEB/issues/3')
    const description = screen.getByRole('region', { name: 'Description' })
    const comments = screen.getByRole('region', { name: 'Comments' })

    await screen.getByRole('button', { name: 'Edit description' }).click()
    await expect
      .element(description.getByRole('textbox', { name: 'Description' }))
      .toHaveFocus()
    await userEvent.keyboard(' draft')
    await comments.getByRole('button', { name: 'Add a comment…' }).click()
    await expect
      .element(comments.getByRole('textbox', { name: 'Add a comment' }))
      .toHaveFocus()
    await userEvent.keyboard('reply')
    await screen.getByRole('link', { name: 'WEB-2' }).click()

    await expect.element(description.getByText('Parent text')).toBeVisible()
    expect(description.getByRole('textbox').elements()).toEqual([])
    await expect
      .element(comments.getByRole('button', { name: 'Add a comment…' }))
      .toBeVisible()
    expect(
      comments.getByRole('textbox', { name: 'Add a comment' }).elements()
    ).toEqual([])
  })

  it('leaves posted comments alone while a new one is typed', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = screen.getByRole('region', { name: 'Comments' })
    const field = comments.getByRole('textbox', { name: 'Add a comment' })
    await expect.element(comments.getByRole('article').first()).toBeVisible()
    await comments.getByRole('button', { name: 'Add a comment…' }).click()
    await expect
      .element(comments.getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()
    const renders = vi.mocked(Markdown).mock.calls.length

    await userEvent.keyboard('abc')
    await expect.element(field).toHaveTextContent('abc')

    expect(vi.mocked(Markdown).mock.calls.length).toBe(renders)
  })

  it('posts a comment that starts with an indented code block as typed', async () => {
    const requests = inProjects({ [COMMENT]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = screen.getByRole('region', { name: 'Comments' })

    await comments.getByRole('button', { name: 'Add a comment…' }).click()
    await expect
      .element(comments.getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()
    await userEvent.keyboard('    let x = 1  ')
    await userEvent.keyboard(mod('{Enter}'))

    await expect
      .poll(() => bodiesOf(requests, COMMENT))
      .toEqual([{ body: '    let x = 1' }])
  })
})

const REM = 16

/** Each Details group, as the names of its rows; whether a line sits above it. */
/** The Details region once the page is shown (it stays hidden until the terms check answers). */
const detailsOf = async (screen: RenderResult) => {
  const details = screen.getByRole('region', { name: 'Details' })
  await expect.element(details).toBeVisible()
  return details.element()
}

const groupsOf = async (screen: RenderResult) => {
  const details = await detailsOf(screen)
  return [...details.children].slice(1).map((group) => ({
    rows: [...group.children].map((row) => row.firstElementChild?.textContent),
    divider: getComputedStyle(group).borderTopWidth,
  }))
}

const SCRUM_GROUPS = [
  { rows: ['Status', 'Assignee'], divider: '0px' },
  { rows: ['Priority', 'Type', 'Points', 'Labels'], divider: '1px' },
  { rows: ['Sprint', 'Epic'], divider: '1px' },
  { rows: ['Reporter', 'Created', 'Updated'], divider: '1px' },
]

const widthOf = async (screen: RenderResult) =>
  (await detailsOf(screen)).getBoundingClientRect().width

const LONG_EPIC = 'Checkout revamp across every storefront and the mobile app'

const withEpicAndLabels = (labels: string[]) => ({
  'GET /api/projects/WEB/issues/1': {
    status: 200,
    body: {
      ...issue({ key: 'WEB-1', summary: 'Write the release notes' }),
      labels,
      parent_key: 'WEB-9',
    },
  },
  'GET /api/projects/WEB/issues': {
    status: 200,
    body: {
      items: [issue({ key: 'WEB-9', summary: LONG_EPIC, issue_type: 'epic' })],
      next_cursor: null,
    },
  },
  // A slow runner answers the terms check after the issue; the page stays hidden until then.
  'GET /api/me/legal': {
    status: 200,
    body: {
      required: true,
      terms_version: '2026-10-16',
      privacy_version: '2026-10-16',
      accepted: true,
    },
    until: () => new Promise((resolve) => setTimeout(resolve, 400)),
  },
})

describe('issue details layout', () => {
  it('gives Details a 22rem column at 1280, grouped, chips wrapping inside the value column', async () => {
    await page.viewport(1280, 800)
    inProjects(
      withEpicAndLabels(['documentation', 'good-first-issue', 'help-wanted'])
    )
    const { screen } = await renderApp('/p/WEB/issues/1')
    const epic = screen.getByLabelText('Epic')
    await expect.element(epic).toHaveValue('WEB-9')

    expect(await widthOf(screen)).toBe(22 * REM)
    expect(await groupsOf(screen)).toEqual(SCRUM_GROUPS)
    await expect
      .element(screen.getByLabelText('Sprint'))
      .toHaveAttribute('title', 'Sprint 4')
    await expect.element(epic).toHaveAttribute('title', `WEB-9 ${LONG_EPIC}`)
    const removes = screen
      .getByRole('button', { name: /^Remove label/ })
      .elements()
    expect(removes).toHaveLength(3)
    const column = removes[0].closest('[data-slot=label-chip]')?.parentElement
    if (!column) throw new Error('no value column')
    const right = column.getBoundingClientRect().right
    const tops = new Set(
      removes.map((remove) => {
        const chip = remove.closest('[data-slot=label-chip]')
        expect(chip?.getBoundingClientRect().right).toBeLessThanOrEqual(right)
        return chip?.getBoundingClientRect().top
      })
    )
    expect(tops.size).toBeGreaterThan(1)
  })

  it('widens the dialog to 1080px on a wide screen', async () => {
    await page.viewport(1440, 900)
    const { dialog } = await openFromBoard()

    await expect
      .poll(() => dialog.element().getBoundingClientRect().width)
      .toBe(1080)
    expect(
      dialog
        .getByRole('region', { name: 'Details' })
        .element()
        .getBoundingClientRect().width
    ).toBe(22 * REM)
  })

  it('keeps a 19rem column at 800 in the same order', async () => {
    await page.viewport(800, 800)
    inProjects(withEpicAndLabels(['docs']))
    const { screen } = await renderApp('/p/WEB/issues/1')
    await expect.element(screen.getByLabelText('Epic')).toHaveValue('WEB-9')

    expect(await widthOf(screen)).toBe(19 * REM)
    expect(await groupsOf(screen)).toEqual(SCRUM_GROUPS)
  })

  it('leaves out a group with nothing to show: an epic on a kanban board', async () => {
    await page.viewport(800, 800)
    inProjects({
      'GET /api/projects/OPS/issues/7': {
        status: 200,
        body: issue({
          key: 'OPS-7',
          summary: 'Rework the alerts',
          issue_type: 'epic',
          sprint_id: null,
          sprint_name: null,
        }),
      },
      'GET /api/projects/OPS/issues/7/comments': {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    })
    const { screen } = await renderApp('/p/OPS/issues/7')
    await expect
      .element(screen.getByLabelText('Summary'))
      .toHaveValue('Rework the alerts')

    expect(await groupsOf(screen)).toEqual([
      { rows: ['Status', 'Assignee'], divider: '0px' },
      { rows: ['Priority', 'Type', 'Points', 'Labels'], divider: '1px' },
      { rows: ['Reporter', 'Created', 'Updated'], divider: '1px' },
    ])
  })

  it('stacks at 375 with 44px controls, 16px text and no sideways scroll', async () => {
    await page.viewport(375, 800)
    inProjects(
      withEpicAndLabels(['documentation', 'good-first-issue', 'help-wanted'])
    )
    const { screen } = await renderApp('/p/WEB/issues/1')
    await expect.element(screen.getByLabelText('Epic')).toHaveValue('WEB-9')

    const details = await detailsOf(screen)
    const view = details.closest('[data-issue-view]')
    expect(details.getBoundingClientRect().width).toBe(
      view?.getBoundingClientRect().width
    )
    expect((await groupsOf(screen)).map((group) => group.rows)).toEqual(
      SCRUM_GROUPS.map((group) => group.rows)
    )
    const controls = [
      ...details.querySelectorAll<HTMLElement>('button, select, input'),
    ]
    expect(controls.length).toBeGreaterThan(8)
    for (const control of controls) {
      const box = control.getBoundingClientRect()
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }
    for (const field of details.querySelectorAll('select, input'))
      expect(getComputedStyle(field).fontSize).toBe('16px')
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    )
  })
})

describe('comment thread', () => {
  beforeEach(() => page.viewport(1280, 800))
  afterEach(() => vi.unstubAllEnvs())

  const LIST = 'GET /api/projects/WEB/issues/1/comments'
  const EDIT = 'PATCH /api/projects/WEB/issues/1/comments/5'
  const DELETE = 'DELETE /api/projects/WEB/issues/1/comments/5'
  const OWN: Comment = {
    id: 5,
    author_id: 1,
    author_name: 'Alice',
    body: 'First pass done.',
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
  }
  const LAST: Comment = { ...OWN, id: 6, body: 'Second pass done.' }
  const thread = (items: Comment[], replies = {}) =>
    inProjects({
      [LIST]: { status: 200, body: { items, next_cursor: null } },
      ...replies,
    })
  /** Answers the first list only: the refetch after a write stays pending, so the thread shows what the client did. */
  const heldThread = (items: Comment[], replies = {}) => {
    let calls = 0
    return thread(items, {
      [LIST]: {
        status: 200,
        body: { items, next_cursor: null },
        until: () => (calls++ === 0 ? undefined : new Promise(() => {})),
      },
      ...replies,
    })
  }
  const notes = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      ...WEB_COMMENTS[0],
      id: index + 1,
      body: `Note ${index + 1}`,
    }))
  const commentsOf = (screen: RenderResult) =>
    screen.getByRole('region', { name: 'Comments' })
  const triggerOf = (screen: RenderResult) =>
    commentsOf(screen).getByRole('button', { name: 'Add a comment…' })
  const actionsOf = (screen: RenderResult, index: number) =>
    commentsOf(screen)
      .getByRole('article')
      .nth(index)
      .getByRole('button', { name: 'Comment actions' })
  const menuItems = async () => {
    await expect.element(page.getByRole('menuitem').first()).toBeVisible()
    return page
      .getByRole('menuitem')
      .elements()
      .map((item) => item.textContent)
  }
  const settled = () => new Promise((resolve) => setTimeout(resolve, 150))
  const deleteAt = async (screen: RenderResult, index: number) => {
    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete this comment?',
    })
    await actionsOf(screen, index).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect.element(confirm).not.toBeInTheDocument()
  }
  const editorReady = (screen: RenderResult) =>
    expect
      .element(commentsOf(screen).getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()

  it('says there are no comments yet above the collapsed composer', async () => {
    thread([])
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = commentsOf(screen)

    await expect.element(comments.getByText('No comments yet.')).toBeVisible()
    await expect
      .element(triggerOf(screen))
      .toHaveAttribute('aria-keyshortcuts', 'm')
    await expect
      .element(triggerOf(screen).getByText('M', { exact: true }))
      .toBeVisible()
    expect(comments.getByRole('textbox').elements()).toEqual([])
  })

  it('opens the composer with M; Esc and Cancel close it, keep nothing and give the focus back', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const field = commentsOf(screen).getByRole('textbox', {
      name: 'Add a comment',
    })
    await expect.element(triggerOf(screen)).toBeVisible()

    await userEvent.keyboard('m')
    await expect.element(field).toHaveFocus()
    await editorReady(screen)
    await userEvent.keyboard('half a thought')
    // A completion query is pending for 100 ms after a keystroke; the first Esc would close it.
    await settled()
    await userEvent.keyboard('{Escape}')
    await expect.element(triggerOf(screen)).toHaveFocus()

    await triggerOf(screen).click()
    await editorReady(screen)
    await expect.element(field).toHaveFocus()
    await expect.element(field).not.toHaveTextContent('half a thought')
    await userEvent.keyboard('again')
    await commentsOf(screen).getByRole('button', { name: 'Cancel' }).click()
    await expect.element(triggerOf(screen)).toHaveFocus()
  })

  it('fills a quick reply without posting it; the chips go once there is text', async () => {
    const requests = inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const chips = commentsOf(screen).getByRole('group', {
      name: 'Quick replies',
    })
    await expect.element(chips).toBeVisible()
    expect(
      chips
        .getByRole('button')
        .elements()
        .map((chip) => chip.textContent)
    ).toEqual([
      'Looks good to me',
      'Thanks!',
      'Can you say more?',
      "I'll take a look.",
    ])

    await chips.getByRole('button', { name: 'Thanks!' }).click()
    await editorReady(screen)
    const field = commentsOf(screen).getByRole('textbox', {
      name: 'Add a comment',
    })
    await expect.element(field).toHaveFocus()
    await expect.element(chips).not.toBeInTheDocument()
    await userEvent.keyboard(' Merging now.')

    await expect.element(field).toHaveTextContent('Thanks! Merging now.')
    expect(await bodiesOf(requests, COMMENT)).toEqual([])
  })

  it('has no quick replies in a build with VITE_QUICK_REPLIES=off', async () => {
    vi.stubEnv('VITE_QUICK_REPLIES', 'off')
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')

    await expect.element(triggerOf(screen)).toBeVisible()
    expect(
      commentsOf(screen)
        .getByRole('group', { name: 'Quick replies' })
        .elements()
    ).toEqual([])
  })

  it('puts a refused comment back in the open composer', async () => {
    inProjects({
      [COMMENT]: { status: 500, body: problem(500, 'The database is away.') },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = commentsOf(screen)

    await triggerOf(screen).click()
    await editorReady(screen)
    await userEvent.keyboard('Lost words')
    await comments.getByRole('button', { name: 'Save' }).click()

    await expect
      .element(screen.getByText("Couldn't add the comment"))
      .toBeVisible()
    const field = comments.getByRole('textbox', { name: 'Add a comment' })
    await expect.element(field).toHaveTextContent('Lost words')
    await expect.element(field).toHaveFocus()
    expect(comments.getByRole('article').elements()).toHaveLength(1)
  })

  it('edits an own comment: the same text sends nothing, a change waits for the server and is marked edited', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => {
      answer = resolve
    })
    let saved: Comment | undefined
    const requests = inProjects({
      [LIST]: {
        status: 200,
        body: () => ({
          items: [WEB_COMMENTS[0], saved ?? OWN],
          next_cursor: null,
        }),
      },
      [EDIT]: {
        status: 200,
        until,
        body: () =>
          (saved = {
            ...OWN,
            body: 'First pass done. Second too.',
            edited_at: new Date().toISOString(),
            edited_by_id: 1,
            edited_by_name: 'Alice',
          }),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = commentsOf(screen)
    const own = comments.getByRole('article').nth(1)
    const field = comments.getByRole('textbox', { name: 'Edit comment' })

    await actionsOf(screen, 1).click()
    expect(await menuItems()).toEqual(['Copy link', 'Edit', 'Delete'])
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await editorReady(screen)
    await expect.element(field).toHaveFocus()
    await expect.element(field).toHaveTextContent('First pass done.')
    expect(
      comments.getByRole('group', { name: 'Quick replies' }).elements()
    ).toEqual([])
    await comments.getByRole('button', { name: 'Save' }).click()
    await expect.element(field).not.toBeInTheDocument()
    expect(await bodiesOf(requests, EDIT)).toEqual([])

    await actionsOf(screen, 1).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await editorReady(screen)
    await userEvent.keyboard(' Second too.')
    await comments.getByRole('button', { name: 'Save' }).click()
    await expect.element(field).toHaveAttribute('aria-readonly', 'true')
    answer()

    await expect.element(field).not.toBeInTheDocument()
    await expect
      .element(own.getByText('(edited)'))
      .toHaveAttribute('title', expect.stringMatching(/^Edited by Alice · /))
    await expect.element(own).toHaveTextContent('First pass done. Second too.')
    expect(await bodiesOf(requests, EDIT)).toEqual([
      { body: 'First pass done. Second too.' },
    ])
  })

  it('keeps the edit under its error; Esc closes it with the focus back on the menu', async () => {
    thread([...WEB_COMMENTS, OWN], {
      [EDIT]: {
        status: 422,
        body: problem(422, 'Check the fields.', [
          { field: 'body', message: 'must not be empty' },
        ]),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = commentsOf(screen)
    const field = comments.getByRole('textbox', { name: 'Edit comment' })

    await actionsOf(screen, 1).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await editorReady(screen)
    await userEvent.keyboard(' More')
    await comments.getByRole('button', { name: 'Save' }).click()

    await expect.element(comments.getByText('must not be empty')).toBeVisible()
    await expect.element(field).toHaveTextContent('First pass done. More')
    await field.click()
    await userEvent.keyboard('{Escape}')
    await expect.element(field).not.toBeInTheDocument()
    await expect.element(actionsOf(screen, 1)).toHaveFocus()
    await expect
      .element(comments.getByRole('article').nth(1))
      .toHaveTextContent('First pass done.')
  })

  it('deletes after the confirm at once, and puts the comment back when the server refuses', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => {
      answer = resolve
    })
    heldThread([...WEB_COMMENTS, OWN], {
      [DELETE]: {
        status: 500,
        body: problem(500, 'The database is away.'),
        until,
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const articles = commentsOf(screen).getByRole('article')
    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete this comment?',
    })

    await actionsOf(screen, 1).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect.element(confirm).toHaveTextContent("It can't be undone.")
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(confirm).not.toBeInTheDocument()
    await expect.element(actionsOf(screen, 1)).toHaveFocus()
    expect(articles.elements()).toHaveLength(2)

    await actionsOf(screen, 1).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect.element(confirm).not.toBeInTheDocument()
    await expect.poll(() => articles.elements().length).toBe(1)
    answer()

    await expect
      .element(screen.getByText("Couldn't delete the comment"))
      .toBeVisible()
    await expect.poll(() => articles.elements().length).toBe(2)
    await expect.element(articles.nth(1)).toHaveTextContent('First pass done.')
  })

  it('takes clicks again after a delete confirmed while the menu is still fading out', async () => {
    heldThread([...WEB_COMMENTS, OWN], { [DELETE]: { status: 204 } })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete this comment?',
    })
    await actionsOf(screen, 1).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(confirm).not.toBeInTheDocument()

    await actionsOf(screen, 1).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const sure = confirm.getByRole('button', { name: 'Delete' })
    await expect.element(sure).toBeInTheDocument()
    sure.element().dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(confirm).not.toBeInTheDocument()
    await expect
      .poll(() => getComputedStyle(document.body).pointerEvents)
      .toBe('auto')
  })

  it('puts back only the refused one of two quick deletes, in its place', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => {
      answer = resolve
    })
    heldThread([...WEB_COMMENTS, OWN, LAST], {
      [DELETE]: {
        status: 500,
        body: problem(500, 'The database is away.'),
        until,
      },
      'DELETE /api/projects/WEB/issues/1/comments/6': { status: 204 },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const articles = commentsOf(screen).getByRole('article')

    await deleteAt(screen, 1)
    await deleteAt(screen, 1)
    await expect.poll(() => articles.elements().length).toBe(1)
    answer()

    await expect
      .element(screen.getByText("Couldn't delete the comment"))
      .toBeVisible()
    await expect
      .poll(() => articles.elements().map((article) => article.textContent))
      .toEqual([
        expect.stringContaining('Draft is in the shared doc.'),
        expect.stringContaining('First pass done.'),
      ])
  })

  it('gives the focus after a delete to the next comment, else the one before, else the composer', async () => {
    heldThread([...WEB_COMMENTS, OWN, LAST], {
      [DELETE]: { status: 204 },
      'DELETE /api/projects/WEB/issues/1/comments/6': { status: 204 },
      'DELETE /api/projects/WEB/issues/1/comments/1': { status: 204 },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const articles = commentsOf(screen).getByRole('article')

    await deleteAt(screen, 1)
    await expect.element(articles.nth(1)).toHaveTextContent('Second pass done.')
    await expect.element(actionsOf(screen, 1)).toHaveFocus()
    await deleteAt(screen, 1)
    await expect.element(actionsOf(screen, 0)).toHaveFocus()
    await deleteAt(screen, 0)
    await expect.element(triggerOf(screen)).toHaveFocus()
  })

  it('offers no actions on a comment the server has not taken yet', async () => {
    inProjects({ [COMMENT]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const articles = commentsOf(screen).getByRole('article')
    await expect.element(actionsOf(screen, 0)).toBeInTheDocument()

    await triggerOf(screen).click()
    await editorReady(screen)
    await userEvent.keyboard('Ship it on Friday.')
    await commentsOf(screen).getByRole('button', { name: 'Save' }).click()

    await expect
      .element(articles.nth(1))
      .toHaveTextContent('Ship it on Friday.')
    expect(
      articles
        .nth(1)
        .getByRole('button', { name: 'Comment actions' })
        .elements()
    ).toEqual([])
  })

  it('brings the quick replies back once the comment being edited is gone', async () => {
    let gone = false
    inProjects({
      [LIST]: {
        status: 200,
        body: () => ({
          items: gone ? WEB_COMMENTS : [...WEB_COMMENTS, OWN],
          next_cursor: null,
        }),
      },
      [EDIT]: {
        status: 404,
        body: () => {
          gone = true
          return problem(404, 'No such comment.')
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = commentsOf(screen)
    const chips = comments.getByRole('group', { name: 'Quick replies' })

    await actionsOf(screen, 1).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await editorReady(screen)
    await expect.element(chips).not.toBeInTheDocument()
    await userEvent.keyboard(' More')
    await comments.getByRole('button', { name: 'Save' }).click()

    await expect
      .poll(() => comments.getByRole('article').elements().length)
      .toBe(1)
    await expect.element(chips).toBeVisible()
  })

  it('gives a member only Copy link on a comment someone else wrote', async () => {
    inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, role: 'member' },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await actionsOf(screen, 0).click()
    expect(await menuItems()).toEqual(['Copy link'])
  })

  it('gives an admin Edit and Delete on a comment someone else wrote', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')

    await actionsOf(screen, 0).click()
    expect(await menuItems()).toEqual(['Copy link', 'Edit', 'Delete'])
  })

  it('copies the link to the comment on the issue page', async () => {
    inProjects()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { screen } = await renderApp('/p/WEB/issues/1')

    await actionsOf(screen, 0).click()
    await page.getByRole('menuitem', { name: 'Copy link' }).click()

    await expect.element(screen.getByText('Link copied')).toBeVisible()
    expect(copy).toHaveBeenCalledWith(
      expect.stringMatching(/\/p\/WEB\/issues\/1#comment-1$/)
    )
  })

  it('dates an older comment, names the editor from the members, and spells both out on hover', async () => {
    thread([
      {
        ...WEB_COMMENTS[0],
        created_at: '2025-12-30T15:00:00Z',
        edited_at: '2026-01-02T15:00:00Z',
        edited_by_id: 2,
        edited_by_name: 'Robert',
      },
    ])
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comment = commentsOf(screen).getByRole('article')

    await expect
      .element(comment.getByText('Dec 30, 2025'))
      .toHaveAttribute('title', expect.stringMatching(/^Dec 30, 2025, /))
    await expect
      .element(comment.getByText('(edited)'))
      .toHaveAttribute(
        'title',
        expect.stringMatching(/^Edited by Bob Stone · Jan 2, 2026, /)
      )
  })

  it('loads every page of a long thread', async () => {
    const all = notes(201)
    const requests = inProjects({
      [LIST]: {
        status: 200,
        body: (request: Request) =>
          new URL(request.url).searchParams.get('cursor') === null
            ? { items: all.slice(0, 200), next_cursor: 200 }
            : { items: all.slice(200), next_cursor: null },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comments = commentsOf(screen)

    await expect.element(comments.getByText('Note 201')).toBeVisible()
    expect(comments.getByRole('article').elements()).toHaveLength(201)
    expect(
      requests
        .filter((request) => routeOf(request) === LIST)
        .map((request) => new URL(request.url).searchParams.get('cursor'))
    ).toEqual([null, '200'])
  })

  it('scrolls to the comment in the URL and highlights it for 3 seconds', async () => {
    thread(notes(30))
    const { screen } = await renderApp('/p/WEB/issues/1#comment-30')
    const target = commentsOf(screen).getByRole('listitem').nth(29)

    await expect.element(target).toHaveAttribute('id', 'comment-30')
    await expect.element(target).toHaveClass(/bg-muted/)
    await expect
      .poll(() => {
        const box = target.element().getBoundingClientRect()
        return box.top >= 0 && box.bottom <= innerHeight
      })
      .toBe(true)
    await expect.element(target, { timeout: 4000 }).not.toHaveClass(/bg-muted/)
  })

  it('opens the issue with no message when the comment in the URL is gone', async () => {
    thread(notes(3))
    const { screen } = await renderApp('/p/WEB/issues/1#comment-99')
    const items = commentsOf(screen).getByRole('listitem')

    await expect.element(items.nth(2)).toHaveTextContent('Note 3')
    await settled()
    expect(
      items.elements().filter((item) => item.classList.contains('bg-muted'))
    ).toEqual([])
    expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(0)
  })

  it('finds the comment in the URL in a browser without checkVisibility', async () => {
    // Safari before 17.4 has no Element.checkVisibility.
    Object.defineProperty(HTMLLIElement.prototype, 'checkVisibility', {
      value: undefined,
      configurable: true,
    })
    try {
      thread(notes(3))
      await renderApp('/p/WEB/issues/1#comment-2')

      // Plain DOM: the locators call checkVisibility on a list item themselves.
      await vi.waitFor(() =>
        expect(document.getElementById('comment-2')?.className).toMatch(
          /bg-muted/
        )
      )
    } finally {
      Reflect.deleteProperty(HTMLLIElement.prototype, 'checkVisibility')
    }
  })

  it('keeps the composer, chips and comment actions at 44px at 375 with no sideways scroll', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const chips = commentsOf(screen).getByRole('group', {
      name: 'Quick replies',
    })
    await expect.element(chips).toBeVisible()

    const controls = [
      triggerOf(screen).element(),
      actionsOf(screen, 0).element(),
      ...chips.getByRole('button').elements(),
    ]
    for (const control of controls) {
      const box = control.getBoundingClientRect()
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }
    expect(getComputedStyle(actionsOf(screen, 0).element()).opacity).toBe('1')
    await expect
      .element(triggerOf(screen).getByText('M', { exact: true }))
      .not.toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    )
  })
})
