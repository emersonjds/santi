import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { Issue } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import { WEB, inProjects, issue, problem, routeOf } from '@/test/stub-api'

const MOVE_3 = 'POST /api/projects/WEB/issues/3/move'
const PATCH_3 = 'PATCH /api/projects/WEB/issues/3'
const MOVE_PARENT = 'POST /api/projects/WEB/issues/1/move'
const pending = { status: 200, body: {}, until: new Promise(() => {}) }

const subtask = (key: string, status_id: number, fields: Partial<Issue> = {}) =>
  issue({
    key,
    summary: `Step ${key}`,
    issue_type: 'subtask',
    parent_key: 'WEB-1',
    status_id,
    ...fields,
  })

const withSubtasks = (items: Issue[]) => ({
  'GET /api/projects/WEB/issues': {
    status: 200,
    body: { items, next_cursor: null },
  },
})

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const sectionOf = (screen: RenderResult) =>
  screen.getByRole('region', { name: 'Subtasks' })

describe('subtask workflow', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('counts done subtasks in the header with a bar', async () => {
    inProjects(withSubtasks([subtask('WEB-3', 20), subtask('WEB-4', 30)]))
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await expect
      .element(section.getByRole('heading'))
      .toHaveTextContent('Subtasks · 1 of 2 done')
    const bar = section.getByRole('progressbar')
    await expect.element(bar).toHaveAttribute('aria-valuenow', '1')
    await expect.element(bar).toHaveAttribute('aria-valuemax', '2')
  })

  it('shows a bare header and no bar without subtasks', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await expect
      .element(section.getByRole('heading'))
      .toHaveTextContent(/^Subtasks$/)
    expect(section.getByRole('progressbar').elements()).toHaveLength(0)
  })

  it('moves a subtask when its status changes, and reverts a refusal', async () => {
    const requests = inProjects({
      ...withSubtasks([subtask('WEB-3', 10)]),
      [MOVE_3]: { status: 409, body: problem(409, 'No.') },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const status = sectionOf(screen).getByLabelText('Status of WEB-3')
    await expect.element(status).toHaveValue('10')
    await status.selectOptions('In review')

    await expect
      .element(screen.getByText('Could not change the status.'))
      .toBeVisible()
    await expect.element(status).toHaveValue('10')
    expect(await bodiesOf(requests, MOVE_3)).toEqual([{ status_id: 21 }])
  })

  it('shows the new status at once while the move is in flight', async () => {
    inProjects({ ...withSubtasks([subtask('WEB-3', 10)]), [MOVE_3]: pending })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const status = sectionOf(screen).getByLabelText('Status of WEB-3')
    await status.selectOptions('In review')

    await expect.element(status).toHaveValue('21')
    await expect.element(status).toHaveAttribute('aria-busy', 'true')
  })

  it('assigns a subtask in place, and reverts a refusal', async () => {
    const requests = inProjects({
      ...withSubtasks([subtask('WEB-3', 10)]),
      [PATCH_3]: { status: 409, body: problem(409, 'No.') },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const assignee = sectionOf(screen).getByLabelText('Assignee of WEB-3')
    await assignee.selectOptions('Bob Stone')

    await expect
      .element(screen.getByText('Could not change the assignee.'))
      .toBeVisible()
    await expect.element(assignee).toHaveValue('')
    expect(await bodiesOf(requests, PATCH_3)).toEqual([{ assignee_id: 2 }])
  })

  it('locks every row control in an archived project', async () => {
    inProjects({
      ...withSubtasks([subtask('WEB-3', 10)]),
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived' },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await expect
      .element(section.getByLabelText('Status of WEB-3'))
      .toHaveAttribute('aria-disabled', 'true')
    await expect
      .element(section.getByRole('button', { name: 'Add subtask' }))
      .toHaveAttribute('aria-disabled', 'true')
    expect(section.getByLabelText('Assignee of WEB-3').elements()).toHaveLength(
      0
    )
    expect(section.getByLabelText('Priority of WEB-3').elements()).toHaveLength(
      0
    )
  })

  it('stacks a row on two lines at 375 with 44px controls and no sideways scroll', async () => {
    await page.viewport(375, 800)
    inProjects(withSubtasks([subtask('WEB-3', 10)]))
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    const link = section.getByRole('link', { name: 'Step WEB-3' })
    await expect.element(link).toBeVisible()
    const controls = ['Status', 'Priority', 'Assignee'].map((name) =>
      section
        .getByLabelText(`${name} of WEB-3`)
        .element()
        .getBoundingClientRect()
    )
    const summary = link.element().getBoundingClientRect()
    for (const box of controls) {
      expect(box.top).toBeGreaterThanOrEqual(summary.bottom)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
  })

  it('offers to finish the parent when its last open subtask is done', async () => {
    const requests = inProjects({
      ...withSubtasks([subtask('WEB-3', 20), subtask('WEB-4', 30)]),
      [MOVE_3]: { status: 200, body: subtask('WEB-3', 30) },
      [MOVE_PARENT]: {
        status: 200,
        body: issue({ key: 'WEB-1', summary: 'x' }),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await sectionOf(screen)
      .getByLabelText('Status of WEB-3')
      .selectOptions('Done')
    await expect
      .element(screen.getByText('All subtasks are done. Move WEB-1 to Done?'))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Move', exact: true }).click()

    await expect.element(screen.getByText('WEB-1 moved to Done.')).toBeVisible()
    expect(await bodiesOf(requests, MOVE_PARENT)).toEqual([{ status_id: 30 }])
  })

  it('says so when moving the parent fails', async () => {
    inProjects({
      ...withSubtasks([subtask('WEB-3', 20)]),
      [MOVE_3]: { status: 200, body: subtask('WEB-3', 30) },
      [MOVE_PARENT]: { status: 409, body: problem(409, 'No.') },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await sectionOf(screen)
      .getByLabelText('Status of WEB-3')
      .selectOptions('Done')
    await screen.getByRole('button', { name: 'Move', exact: true }).click()

    await expect
      .element(screen.getByText('Could not move WEB-1.'))
      .toBeVisible()
  })

  it('makes no offer while another subtask stays open', async () => {
    const requests = inProjects({
      ...withSubtasks([subtask('WEB-3', 20), subtask('WEB-4', 10)]),
      [MOVE_3]: { status: 200, body: subtask('WEB-3', 30) },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    await sectionOf(screen)
      .getByLabelText('Status of WEB-3')
      .selectOptions('Done')
    await expect.poll(() => bodiesOf(requests, MOVE_3)).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.getByText(/All subtasks are done/).elements()).toHaveLength(0)
  })
})
