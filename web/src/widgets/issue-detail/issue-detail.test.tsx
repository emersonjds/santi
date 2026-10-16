import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects, issue, problem, routeOf } from '@/test/stub-api'

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
    await expect.element(screen.getByLabelText('Labels')).toHaveValue('docs')
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

    await dialog.getByLabelText('Priority').selectOptions('High')
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
    await screen.getByLabelText('Sprint').selectOptions('Sprint 5')

    await expect
      .element(screen.getByText("a subtask follows its parent's sprint"))
      .toBeVisible()
    await expect.element(screen.getByLabelText('Sprint')).toHaveValue('4')
  })

  it('saves the summary, description and every detail field on change', async () => {
    const requests = inProjects({ [PATCH]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const summary = screen.getByLabelText('Summary')
    await summary.fill('Write the v1 notes')
    await userEvent.keyboard('{Enter}')
    await screen.getByRole('button', { name: 'Edit description' }).click()
    await screen
      .getByRole('textbox', { name: 'Description' })
      .fill('Only the board.')
    await screen.getByRole('button', { name: 'Save' }).click()
    await expect.element(screen.getByText('Only the board.')).toBeVisible()
    await screen.getByRole('button', { name: 'Assign to me' }).click()
    await screen.getByLabelText('Points').fill('5')
    await userEvent.keyboard('{Enter}')
    await screen.getByLabelText('Labels').fill('docs release')
    await userEvent.keyboard('{Enter}')
    await screen.getByLabelText('Parent').fill('WEB-7')
    await userEvent.keyboard('{Enter}')
    await screen.getByLabelText('Sprint').selectOptions('Backlog')

    await expect
      .poll(() => bodiesOf(requests, PATCH))
      .toEqual([
        { summary: 'Write the v1 notes' },
        { description: 'Only the board.' },
        { assignee_id: 1 },
        { points: 5 },
        { labels: ['docs', 'release'] },
        { parent: 'WEB-7' },
        { sprint_id: null },
      ])
    await expect
      .element(screen.getByLabelText('Summary'))
      .toHaveValue('Write the v1 notes')
  })

  it('adds a comment at once', async () => {
    const requests = inProjects({ [COMMENT]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await screen.getByLabelText('Add a comment').fill('Ship it on Friday.')
    await screen.getByRole('button', { name: 'Comment' }).click()

    const comments = screen
      .getByRole('region', { name: 'Comments' })
      .getByRole('article')
    await expect.element(comments.nth(1)).toHaveTextContent('Alice')
    await expect
      .element(comments.nth(1))
      .toHaveTextContent('Ship it on Friday.')
    await expect.element(screen.getByLabelText('Add a comment')).toHaveValue('')
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
})
