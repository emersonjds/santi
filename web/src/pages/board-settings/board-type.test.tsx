import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  MY_OPS,
  MY_WEB,
  WEB,
  WEB_SETTINGS,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const held = () => {
  let release = () => {}
  const until = new Promise<void>((resolve) => (release = resolve))
  return { until, release: () => release() }
}

const block = () => page.getByRole('group', { name: 'Board type' })
const option = (name: 'Scrum' | 'Kanban') =>
  block().getByRole('button', { name: new RegExp(`^${name}`) })
const dialog = () => page.getByRole('alertdialog')

const KANBAN_SETTINGS = {
  ...WEB_SETTINGS,
  board_type: 'kanban',
  done_window_days: 14,
  columns: WEB_SETTINGS.columns.map((column, index) => ({
    ...column,
    wip_limit: index < 2 ? 3 : null,
  })),
} as const

/** The project, its settings and the sidebar list answer with the type the last PATCH set. */
const switching = (
  start: 'scrum' | 'kanban',
  replies: Parameters<typeof inProjects>[0] = {},
  until?: Promise<void>
) => {
  let type: 'scrum' | 'kanban' = start
  return inProjects({
    'GET /api/projects/WEB': {
      status: 200,
      body: () => ({ ...WEB, board_type: type }),
    },
    'GET /api/me/projects': {
      status: 200,
      body: () => [{ ...MY_WEB, board_type: type }, MY_OPS],
    },
    'GET /api/projects/WEB/board/settings': {
      status: 200,
      body: () => (type === 'kanban' ? KANBAN_SETTINGS : WEB_SETTINGS),
    },
    'PATCH /api/projects/WEB': {
      status: 200,
      until,
      body: () => {
        type = type === 'scrum' ? 'kanban' : 'scrum'
        return { ...WEB, board_type: type }
      },
    },
    ...replies,
  })
}

const patches = (requests: Request[]) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === 'PATCH /api/projects/WEB')
      .map((request) => request.clone().json())
  )

describe('project settings: Board type (SAN-224)', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('shows admins the current type pressed, with what each one means', async () => {
    switching('scrum')
    await renderApp('/p/WEB/settings')

    await expect
      .element(option('Scrum'))
      .toHaveAttribute('aria-pressed', 'true')
    await expect
      .element(option('Kanban'))
      .toHaveAttribute('aria-pressed', 'false')
    await expect
      .element(block().getByText('Sprints, a backlog and reports.'))
      .toBeVisible()
    await expect
      .element(block().getByText('One continuous board, no sprints.'))
      .toBeVisible()
  })

  it('pressing the current type does nothing; Cancel and Esc put focus back', async () => {
    switching('scrum')
    await renderApp('/p/WEB/settings')

    await option('Scrum').click()
    expect(dialog().elements()).toHaveLength(0)

    await option('Kanban').click()
    await expect
      .element(dialog().getByRole('heading', { name: 'Switch to Kanban?' }))
      .toHaveFocus()
    await dialog().getByRole('button', { name: 'Cancel' }).click()
    await expect.element(option('Kanban')).toHaveFocus()

    await option('Kanban').click()
    await expect.element(dialog()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(option('Kanban')).toHaveFocus()
    expect(dialog().elements()).toHaveLength(0)
  })

  it('Scrum to Kanban counts the sprints kept as history, and says nothing of them without any', async () => {
    switching('scrum')
    await renderApp('/p/WEB/settings')

    await option('Kanban').click()
    await expect
      .element(
        dialog().getByText(
          'Open issues stay where they are and show on one continuous board.'
        )
      )
      .toBeVisible()
    await expect
      .element(
        dialog().getByText(
          '3 sprints and their reports stay as history, hidden until you switch back to Scrum.'
        )
      )
      .toBeVisible()
    await expect
      .element(dialog().getByRole('button', { name: 'Switch to Kanban' }))
      .toBeVisible()
  })

  it('omits the sprint line when the project never had a sprint', async () => {
    switching('scrum', {
      'GET /api/projects/WEB/sprints': { status: 200, body: [] },
    })
    await renderApp('/p/WEB/settings')

    await option('Kanban').click()
    await expect.element(dialog()).toBeVisible()
    expect(
      dialog()
        .getByText(/sprint/)
        .elements()
    ).toHaveLength(0)
  })

  it('switches to Kanban: Switching…, toast, Reports gone, focus on Kanban', async () => {
    const reply = held()
    const requests = switching('scrum', {}, reply.until)
    const { screen } = await renderApp('/p/WEB/settings')
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Project views' })
          .getByRole('link', { name: 'Reports' })
      )
      .toBeVisible()

    await option('Kanban').click()
    await dialog().getByRole('button', { name: 'Switch to Kanban' }).click()
    const confirm = dialog().getByRole('button', { name: 'Switching…' })
    await expect.element(confirm).toBeDisabled()
    await expect
      .element(dialog().getByRole('button', { name: 'Cancel' }))
      .toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog()).toBeVisible()
    reply.release()

    await expect
      .element(screen.getByText('Switched to Kanban.', { exact: true }))
      .toBeVisible()
    await expect
      .element(option('Kanban'))
      .toHaveAttribute('aria-pressed', 'true')
    await expect.element(option('Kanban')).toHaveFocus()
    await expect
      .poll(() => screen.getByRole('link', { name: 'Reports' }).elements())
      .toHaveLength(0)
    expect(await patches(requests)).toEqual([
      { board_type: 'kanban', expected_board_type: 'scrum' },
    ])
  })

  it('Kanban to Scrum names the cleared limits and done window, then Reports comes back', async () => {
    const requests = switching('kanban')
    const { screen } = await renderApp('/p/WEB/settings')

    await option('Scrum').click()
    await expect
      .element(dialog().getByRole('heading', { name: 'Switch to Scrum?' }))
      .toBeVisible()
    await expect
      .element(dialog().getByText('Open issues move to the backlog.'))
      .toBeVisible()
    await expect
      .element(dialog().getByText('2 column limits are cleared.'))
      .toBeVisible()
    await expect
      .element(dialog().getByText('Hiding done work after 14 days turns off.'))
      .toBeVisible()
    await dialog().getByRole('button', { name: 'Switch to Scrum' }).click()

    await expect
      .element(screen.getByText('Switched to Scrum.', { exact: true }))
      .toBeVisible()
    await expect.element(option('Scrum')).toHaveFocus()
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Project views' })
          .getByRole('link', { name: 'Reports' })
      )
      .toBeVisible()
    expect(await patches(requests)).toEqual([
      { board_type: 'scrum', expected_board_type: 'kanban' },
    ])
  })

  it('a stale type closes the dialog and explains under the control', async () => {
    switching('scrum', {
      'PATCH /api/projects/WEB': {
        status: 409,
        body: {
          ...problem(409, 'The board type changed.'),
          type: 'urn:santi:error:board-type-changed',
        },
      },
    })
    await renderApp('/p/WEB/settings')

    await option('Kanban').click()
    await dialog().getByRole('button', { name: 'Switch to Kanban' }).click()

    await expect
      .element(block().getByRole('alert'))
      .toHaveTextContent(
        'The board type changed since you loaded this page. Reload to see the current type.'
      )
    expect(dialog().elements()).toHaveLength(0)
    await expect
      .element(option('Scrum'))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('says only admins may switch on 403, and toasts a failure keeping the dialog', async () => {
    switching('scrum', {
      'PATCH /api/projects/WEB': {
        status: 403,
        body: problem(403, 'Forbidden.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/settings')

    await option('Kanban').click()
    await dialog().getByRole('button', { name: 'Switch to Kanban' }).click()
    await expect
      .element(block().getByRole('alert'))
      .toHaveTextContent('Only a project admin can change the board type.')

    inProjects({
      'PATCH /api/projects/WEB': { status: 500, body: problem(500, 'Boom') },
    })
    await option('Kanban').click()
    await dialog().getByRole('button', { name: 'Switch to Kanban' }).click()
    await expect
      .element(screen.getByText("Couldn't switch. Try again."))
      .toBeVisible()
    await expect
      .element(dialog().getByRole('button', { name: 'Switch to Kanban' }))
      .toBeEnabled()
  })

  it('is locked on an archived project', async () => {
    inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived' },
      },
    })
    await renderApp('/p/WEB/settings')

    await expect
      .element(option('Kanban'))
      .toHaveAttribute('aria-disabled', 'true')
    await option('Kanban').click({ force: true })
    expect(dialog().elements()).toHaveLength(0)
  })
})
