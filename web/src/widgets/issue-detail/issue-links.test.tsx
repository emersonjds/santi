import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Card, IssueLink, Relation } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  WEB,
  WEB_BACKLOG,
  WEB_BOARD,
  inProjects,
  issue,
  problem,
  routeOf,
} from '@/test/stub-api'

const LINKS = 'GET /api/projects/WEB/issues/1/links'
const CREATE = 'POST /api/projects/WEB/issues/1/links'
const FORCE = { force: true }

const link = (
  id: number,
  relation: Relation,
  key: string,
  fields: Partial<IssueLink['issue']> = {}
): IssueLink => ({
  id,
  relation,
  issue: {
    key,
    summary: `Work on ${key}`,
    issue_type: 'task',
    priority: 'medium',
    status_id: 10,
    status_name: 'To Do',
    status_category: 'todo',
    assignee_id: null,
    assignee_name: null,
    ...fields,
  },
})

const withLinks = (links: IssueLink[]) => ({
  [LINKS]: { status: 200, body: links },
})

/** Issue search per project: WEB answers its three issues to any text but "zzz", OPS one. */
const searchable = {
  'GET /api/projects/WEB/issues': {
    status: 200,
    body: (request: Request) => {
      const q = new URL(request.url).searchParams.get('q')
      return {
        items:
          q && q !== 'zzz'
            ? ['WEB-1', 'WEB-2', 'WEB-3'].map((key) =>
                issue({ key, summary: `Login ${key}` })
              )
            : [],
        next_cursor: null,
      }
    },
  },
  'GET /api/projects/OPS/issues': {
    status: 200,
    body: (request: Request) => ({
      items:
        new URL(request.url).searchParams.get('q') === 'zzz'
          ? []
          : [issue({ key: 'OPS-1', summary: 'Login OPS-1' })],
      next_cursor: null,
    }),
  },
}

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const sectionOf = (screen: RenderResult) =>
  screen.getByRole('region', { name: 'Linked issues' })

const openPicker = async (screen: RenderResult, text: string) => {
  const section = sectionOf(screen)
  await section.getByRole('button', { name: 'Link issue' }).click()
  await section.getByRole('combobox', { name: 'Issue to link' }).fill(text)
  return section
}

describe('linked issues (SAN-157)', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('groups links by relation in a fixed order, whichever side made them', async () => {
    inProjects(
      withLinks([
        link(1, 'relates', 'OPS-2', { status_category: 'done' }),
        link(2, 'is_blocked_by', 'WEB-4'),
        link(3, 'blocks', 'WEB-3', {
          assignee_id: 2,
          assignee_name: 'Bob Stone',
          priority: 'urgent',
          status_name: 'In Progress',
          status_category: 'in_progress',
        }),
      ])
    )
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await expect
      .element(section.getByRole('link', { name: 'Work on WEB-3' }))
      .toHaveAttribute('href', '/p/WEB/issues/3')
    expect(
      section
        .getByRole('heading', { level: 4 })
        .elements()
        .map((heading) => heading.textContent)
    ).toEqual(['Blocks', 'Is blocked by', 'Relates to'])
    await expect
      .element(section.getByRole('link', { name: 'Work on OPS-2' }))
      .toHaveAttribute('href', '/p/OPS/issues/2')
    await expect
      .element(section.getByTitle('Work on WEB-3'))
      .toBeInTheDocument()
    await expect
      .element(section.getByText('In Progress', { exact: true }))
      .toBeVisible()
    await expect.element(section.getByText('Urgent priority')).toBeVisible()
    await expect
      .element(section.getByTitle('Assigned to Bob Stone'))
      .toBeVisible()
    await expect
      .element(section.getByRole('button', { name: 'Remove link to OPS-2' }))
      .toBeVisible()
  })

  it('shows only the heading and the add button without links, as for links the viewer cannot open', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await expect
      .element(section.getByRole('button', { name: 'Link issue' }))
      .toBeVisible()
    expect(section.getByRole('listitem').elements()).toEqual([])
    expect(section.getByRole('heading', { level: 4 }).elements()).toEqual([])
  })

  it('links an issue picked from a search across projects', async () => {
    let created = false
    const requests = inProjects({
      ...searchable,
      [LINKS]: {
        status: 200,
        body: () =>
          created
            ? [link(3, 'blocks', 'WEB-3'), link(9, 'relates', 'OPS-1')]
            : [link(3, 'blocks', 'WEB-3')],
      },
      [CREATE]: {
        status: 201,
        body: () => {
          created = true
          return link(9, 'relates', 'OPS-1')
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await section.getByRole('button', { name: 'Link issue' }).click()
    const type = section.getByRole('combobox', { name: 'Link type' })
    await expect.element(type).toHaveFocus()
    await expect.element(type).toHaveValue('blocks')
    await type.selectOptions('relates to')
    await section.getByRole('combobox', { name: 'Issue to link' }).fill('login')

    await expect
      .element(section.getByRole('option', { name: /OPS-1/ }))
      .toBeVisible()
    expect(
      section
        .getByRole('listbox')
        .getByRole('option')
        .elements()
        .map((option) => option.textContent)
    ).toEqual(['WEB-2Login WEB-2', 'OPS-1Login OPS-1'])
    await userEvent.keyboard('{ArrowDown}{Enter}')

    await expect
      .element(section.getByRole('heading', { name: 'Relates to' }))
      .toBeVisible()
    expect(await bodiesOf(requests, CREATE)).toEqual([
      { relation: 'relates', issue: 'OPS-1' },
    ])
    expect(
      section.getByRole('combobox', { name: 'Issue to link' }).elements()
    ).toEqual([])
    await expect
      .element(section.getByRole('button', { name: 'Link issue' }))
      .toHaveFocus()
  })

  it('says when no issue matches', async () => {
    inProjects(searchable)
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = await openPicker(screen, 'zzz')
    await expect.element(section.getByText('No issue found.')).toBeVisible()
  })

  it('names the refusal of a duplicate link and keeps the search', async () => {
    inProjects({
      ...searchable,
      [CREATE]: {
        status: 422,
        body: problem(422, 'Invalid.', [
          { field: 'issue', message: 'these issues already have this link' },
        ]),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = await openPicker(screen, 'login')
    await section.getByRole('option', { name: /WEB-2/ }).click()

    await expect
      .element(
        section.getByText(
          'Could not link the issues: these issues already have this link.'
        )
      )
      .toBeVisible()
    await expect
      .element(section.getByRole('combobox', { name: 'Issue to link' }))
      .toHaveValue('login')
  })

  it('says the link failed when the server breaks', async () => {
    inProjects({
      ...searchable,
      [CREATE]: { status: 500, body: problem(500, 'Boom.') },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = await openPicker(screen, 'login')
    await section.getByRole('option', { name: /WEB-2/ }).click()

    await expect
      .element(section.getByText('Could not link the issues.'))
      .toBeVisible()
  })

  it('cancels the add row with Escape and gives focus back', async () => {
    inProjects(searchable)
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = await openPicker(screen, 'login')
    await userEvent.keyboard('{Escape}')

    expect(
      section.getByRole('combobox', { name: 'Issue to link' }).elements()
    ).toEqual([])
    await expect
      .element(section.getByRole('button', { name: 'Link issue' }))
      .toHaveFocus()
  })

  it('removes a link at once and moves focus to the next remove button', async () => {
    let removed = false
    const requests = inProjects({
      [LINKS]: {
        status: 200,
        body: () =>
          removed
            ? [link(4, 'relates', 'WEB-4')]
            : [link(3, 'blocks', 'WEB-3'), link(4, 'relates', 'WEB-4')],
      },
      'DELETE /api/projects/WEB/issues/1/links/3': {
        status: 204,
        body: () => {
          removed = true
          return undefined
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await section.getByRole('button', { name: 'Remove link to WEB-3' }).click()

    await expect
      .element(section.getByRole('button', { name: 'Remove link to WEB-4' }))
      .toHaveFocus()
    await expect
      .element(section.getByRole('link', { name: 'Work on WEB-3' }))
      .not.toBeInTheDocument()
    expect(requests.map(routeOf)).toContain(
      'DELETE /api/projects/WEB/issues/1/links/3'
    )
  })

  it('keeps the row and says so when a removal fails', async () => {
    inProjects({
      ...withLinks([link(3, 'blocks', 'WEB-3')]),
      'DELETE /api/projects/WEB/issues/1/links/3': {
        status: 500,
        body: problem(500, 'Boom.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await section.getByRole('button', { name: 'Remove link to WEB-3' }).click()

    await expect
      .element(section.getByText('Could not remove the link.'))
      .toBeVisible()
    await expect
      .element(section.getByRole('link', { name: 'Work on WEB-3' }))
      .toBeVisible()
    await expect
      .element(section.getByRole('button', { name: 'Link issue' }))
      .toHaveFocus()
  })

  it('opens the add row on l and focuses the link type', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    await expect
      .element(section.getByRole('button', { name: 'Link issue' }))
      .toBeVisible()
    await userEvent.click(screen.getByRole('heading', { name: 'Description' }))
    await userEvent.keyboard('l')

    await expect
      .element(section.getByRole('combobox', { name: 'Link type' }))
      .toHaveFocus()
    await section.getByRole('combobox', { name: 'Issue to link' }).click()
    await section.getByRole('button', { name: 'Link issue' }).click()
    await expect
      .element(section.getByRole('combobox', { name: 'Link type' }))
      .toHaveFocus()
  })

  it('locks adding and removing in an archived project', async () => {
    inProjects({
      ...withLinks([link(3, 'blocks', 'WEB-3')]),
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived' },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    const add = section.getByRole('button', { name: 'Link issue' })
    await expect.element(add).toHaveAttribute('aria-disabled', 'true')
    await add.click(FORCE)
    expect(
      section.getByRole('combobox', { name: 'Link type' }).elements()
    ).toEqual([])
    await expect
      .element(section.getByRole('button', { name: 'Remove link to WEB-3' }))
      .toHaveAttribute('aria-disabled', 'true')
  })

  it('wraps a row on two lines at 375 with 44px controls and no sideways scroll', async () => {
    await page.viewport(375, 800)
    inProjects(
      withLinks([
        link(3, 'blocks', 'WEB-3', {
          summary: 'A very long summary that keeps going well past any phone',
          assignee_name: 'Bob Stone',
        }),
      ])
    )
    const { screen } = await renderApp('/p/WEB/issues/1')

    const section = sectionOf(screen)
    const summary = section.getByRole('link', { name: /A very long summary/ })
    await expect.element(summary).toBeVisible()
    const remove = section
      .getByRole('button', { name: 'Remove link to WEB-3' })
      .element()
      .getBoundingClientRect()
    const add = section
      .getByRole('button', { name: 'Link issue' })
      .element()
      .getBoundingClientRect()
    expect(remove.top).toBeGreaterThanOrEqual(
      summary.element().getBoundingClientRect().bottom
    )
    expect(remove.height).toBeGreaterThanOrEqual(44)
    expect(remove.width).toBeGreaterThanOrEqual(44)
    expect(add.height).toBeGreaterThanOrEqual(44)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
  })
})

const blockWeb1 = (cards: Card[]) =>
  cards.map((each) =>
    each.key === 'WEB-1' ? { ...each, blocked_by: ['WEB-3', 'OPS-7'] } : each
  )

describe('the blocked marker (SAN-157 Q4)', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('marks a board card blocked by open issues', async () => {
    inProjects({
      'GET /api/projects/WEB/board': {
        status: 200,
        body: {
          ...WEB_BOARD,
          columns: WEB_BOARD.columns.map((column) => ({
            ...column,
            cards: blockWeb1(column.cards),
          })),
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/board')

    const board = screen.getByRole('region', { name: 'Board' })
    await expect
      .element(board.getByText('Blocked', { exact: true }))
      .toHaveAttribute('title', 'Blocked by WEB-3, OPS-7')
    expect(board.getByText('Blocked', { exact: true }).elements()).toHaveLength(
      1
    )
  })

  it('marks a backlog row blocked by open issues', async () => {
    inProjects({
      'GET /api/projects/WEB/backlog': {
        status: 200,
        body: {
          ...WEB_BACKLOG,
          sections: WEB_BACKLOG.sections.map((section) => ({
            ...section,
            cards: blockWeb1(section.cards),
          })),
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/backlog')

    await expect
      .element(screen.getByText('Blocked', { exact: true }))
      .toHaveAttribute('title', 'Blocked by WEB-3, OPS-7')
    expect(
      screen.getByText('Blocked', { exact: true }).elements()
    ).toHaveLength(1)
  })
})
