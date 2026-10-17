import { describe, expect, it } from 'vitest'
import type { Project } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  MY_OPS,
  MY_WEB,
  inProjects,
  routeOf,
  signedIn,
} from '@/test/stub-api'

const HOUR = 3_600_000
const DAY = 24 * HOUR

const ARCHIVED: Project = {
  id: 3,
  key: 'DOC',
  name: 'Docs',
  board_type: 'kanban',
  role: 'admin',
  state: 'archived',
  archived_at: new Date(Date.now() - 3 * HOUR).toISOString(),
  archived_by: 'Alice',
}

const TRASHED: Project = {
  id: 4,
  key: 'OLD',
  name: 'Legacy',
  board_type: 'scrum',
  role: 'admin',
  state: 'trashed',
  trashed_at: new Date(Date.now() - 2 * DAY).toISOString(),
  trashed_by: 'EMERSON JUNIOR DANIEL SILVA',
  purge_at: new Date(Date.now() + 58 * DAY - HOUR).toISOString(),
}

/** `GET /api/projects?state=` answers DOC archived and OLD trashed until they leave that state. */
const withLifecycle = (replies = {}) => {
  const left = new Set<string>()
  const of = (project: Project) => (left.has(project.key) ? [] : [project])
  const leaving = (key: string) => ({
    status: 204,
    body: () => void left.add(key),
  })
  return inProjects({
    'GET /api/projects': {
      status: 200,
      body: (request: Request) => {
        const state = new URL(request.url).searchParams.get('state')
        if (state === 'archived') return of(ARCHIVED)
        if (state === 'trashed') return of(TRASHED)
        return []
      },
    },
    'POST /api/projects/DOC/unarchive': leaving('DOC'),
    'POST /api/projects/OLD/restore': leaving('OLD'),
    'DELETE /api/projects/OLD': leaving('OLD'),
    ...replies,
  })
}

describe('projects page', () => {
  it('lists every project with key, type, lead and star, by name', async () => {
    inProjects()
    const { screen } = await renderApp('/projects')

    await expect
      .element(screen.getByRole('heading', { name: 'Projects', level: 1 }))
      .toBeVisible()
    const rows = screen.getByRole('table').getByRole('row')
    await expect
      .element(rows.nth(1))
      .toHaveTextContent(/Operations.*OPS.*Kanban.*Bob Stone/)
    await expect
      .element(rows.nth(2))
      .toHaveTextContent(/Website.*WEB.*Scrum.*Alice/)
    await expect
      .element(screen.getByRole('button', { name: 'Star Website' }))
      .toHaveAttribute('aria-pressed', 'true')
    await screen
      .getByRole('table')
      .getByRole('link', { name: 'Website' })
      .click()
    await expect
      .element(screen.getByRole('heading', { name: 'Website' }))
      .toBeVisible()
  })

  it('shows the lead as avatar and short name, the full name on hover', async () => {
    inProjects({
      'GET /api/me/projects': {
        status: 200,
        body: [
          { ...MY_OPS, lead_name: 'EMERSON JUNIOR DANIEL SILVA' },
          { ...MY_WEB, lead_name: null },
        ],
      },
    })
    const { screen } = await renderApp('/projects')

    const rows = screen.getByRole('table').getByRole('row')
    await expect
      .element(rows.nth(1))
      .toHaveTextContent(/Operations.*OPS.*Kanban.*ES\s*Emerson Silva$/)
    await expect
      .element(rows.nth(1).getByText('Emerson Silva', { exact: true }))
      .toHaveAttribute('title', 'Emerson Junior Daniel Silva')
    await expect
      .element(rows.nth(2))
      .toHaveTextContent(/Website.*WEB.*Scrum$/)
  })

  it('unstars a project at once', async () => {
    const requests = inProjects({
      'DELETE /api/me/stars/WEB': { status: 204, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/projects')

    const star = screen.getByRole('button', { name: 'Star Website' })
    await star.click()

    await expect.element(star).toHaveAttribute('aria-pressed', 'false')
    expect(requests.map(routeOf)).toContain('DELETE /api/me/stars/WEB')
  })

  it('offers a new project when there are none', async () => {
    signedIn()
    const { screen } = await renderApp('/projects')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    await expect
      .element(
        screen
          .getByRole('main')
          .getByRole('link', { name: 'New project' })
          .last()
      )
      .toBeVisible()
  })

  it('switches between Active, Archived and Trash in the URL', async () => {
    withLifecycle()
    const { screen, router } = await renderApp('/projects')

    const tabs = screen.getByRole('tablist', { name: 'Projects by state' })
    await expect
      .element(tabs.getByRole('tab', { name: 'Active' }))
      .toHaveAttribute('aria-selected', 'true')
    await tabs.getByRole('tab', { name: 'Trash' }).click()

    await expect
      .element(tabs.getByRole('tab', { name: 'Trash' }))
      .toHaveAttribute('aria-selected', 'true')
    expect(router.state.location.search).toEqual({ tab: 'trash' })
    await expect
      .element(screen.getByRole('tabpanel'))
      .toHaveTextContent(/Legacy/)
  })

  it('lists archived projects with when and by whom, and unarchives one', async () => {
    const requests = withLifecycle()
    const { screen } = await renderApp('/projects?tab=archived')

    const row = screen.getByRole('table').getByRole('row').nth(1)
    await expect
      .element(row)
      .toHaveTextContent(/Docs.*DOC.*3 hours ago by Alice/)
    await row.getByRole('button', { name: 'Unarchive Docs' }).click()

    await expect.element(screen.getByText('No archived projects')).toBeVisible()
    expect(requests.map(routeOf)).toContain('POST /api/projects/DOC/unarchive')
  })

  it('lists the trash with days left and restores a project', async () => {
    const requests = withLifecycle()
    const { screen } = await renderApp('/projects?tab=trash')

    const row = screen.getByRole('table').getByRole('row').nth(1)
    await expect
      .element(row)
      .toHaveTextContent(/Legacy.*OLD.*2 days ago by Emerson Silva.*58 days/)
    await expect
      .element(row.getByText('2 days ago by Emerson Silva'))
      .toHaveAttribute('title', 'Emerson Junior Daniel Silva')
    await row.getByRole('button', { name: 'Restore Legacy' }).click()

    await expect.element(screen.getByText('Nothing in the trash')).toBeVisible()
    expect(requests.map(routeOf)).toContain('POST /api/projects/OLD/restore')
  })

  it('deletes a trashed project forever once its key is typed', async () => {
    const requests = withLifecycle()
    const { screen } = await renderApp('/projects?tab=trash')

    await screen.getByRole('button', { name: 'Delete Legacy forever' }).click()
    const dialog = screen.getByRole('alertdialog')
    const confirm = dialog.getByRole('button', { name: 'Delete forever' })
    await expect.element(confirm).toBeDisabled()
    await dialog.getByLabelText('Type OLD to confirm').fill('OLD')
    await confirm.click()

    await expect.element(screen.getByText('Nothing in the trash')).toBeVisible()
    expect(requests.map(routeOf)).toContain('DELETE /api/projects/OLD')
  })
})
