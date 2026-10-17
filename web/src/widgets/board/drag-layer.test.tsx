import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type * as SortableBoardModule from '@/features/move-issue/sortable-board'
import type * as IssueCardModule from '@/entities/issue/issue-card'
import { renderApp } from '@/test/render-app'
import {
  OPS,
  OPS_BOARD,
  OPS_SETTINGS,
  inProjects,
  routeOf,
} from '@/test/stub-api'
import type * as BoardColumnModule from './board-column'

const PUT = 'PUT /api/projects/OPS/board/columns/2'

const dragLayer = vi.hoisted(() => ({
  ready: Promise.resolve(),
  load: () => {},
}))

const columnRenders = vi.hoisted(() => new Map<string, number>())
const cardRenders = vi.hoisted(() => new Map<string, number>())

// The drag layer suspends until the test loads it, as its lazy chunk does in the app.
vi.mock('@/features/move-issue/sortable-board', async (importOriginal) => {
  const { use, createElement } = await import('react')
  const { SortableBoard } = await importOriginal<typeof SortableBoardModule>()
  return {
    SortableBoard: (
      props: Parameters<typeof SortableBoardModule.SortableBoard>[0]
    ) => {
      use(dragLayer.ready)
      return createElement(SortableBoard, props)
    },
  }
})

vi.mock('./board-column', async (importOriginal) => {
  const { createElement } = await import('react')
  const original = await importOriginal<typeof BoardColumnModule>()
  return {
    ...original,
    ColumnShell: (
      props: Parameters<typeof BoardColumnModule.ColumnShell>[0]
    ) => {
      const name = props.column.name
      columnRenders.set(name, (columnRenders.get(name) ?? 0) + 1)
      return createElement(original.ColumnShell, props)
    },
  }
})

vi.mock('@/entities/issue/issue-card', async (importOriginal) => {
  const { createElement } = await import('react')
  const original = await importOriginal<typeof IssueCardModule>()
  return {
    ...original,
    IssueCard: (props: Parameters<typeof IssueCardModule.IssueCard>[0]) => {
      const key = props.card.key
      cardRenders.set(key, (cardRenders.get(key) ?? 0) + 1)
      return createElement(original.IssueCard, props)
    },
  }
})

const adminWithLimits = () =>
  inProjects({
    'GET /api/projects/OPS': { status: 200, body: { ...OPS, role: 'admin' } },
    'GET /api/projects/OPS/board/settings': {
      status: 200,
      body: {
        ...OPS_SETTINGS,
        columns: OPS_SETTINGS.columns.map((column, index) => ({
          ...column,
          name: OPS_BOARD.columns[index].name,
          wip_limit: OPS_BOARD.columns[index].wip_limit,
        })),
      },
    },
    [PUT]: { status: 200, body: {}, until: new Promise(() => {}) },
  })

describe('board drag layer', () => {
  beforeEach(async () => {
    dragLayer.ready = new Promise((resolve) => (dragLayer.load = resolve))
    await page.viewport(1280, 800)
  })

  it('keeps an open column limit editor, its draft and its focus when the drag layer loads', async () => {
    const requests = adminWithLimits()
    const { screen } = await renderApp('/p/OPS/board')
    const doing = screen.getByRole('region', { name: 'Doing' })

    await doing
      .getByRole('button', { name: 'Actions for column Doing' })
      .click()
    await screen.getByRole('menuitem', { name: 'Set WIP limit' }).click()
    const limit = doing.getByLabelText('WIP limit of Doing')
    await limit.fill('3')
    await expect
      .element(doing.getByRole('button', { name: 'Drag OPS-2' }))
      .not.toBeInTheDocument()
    dragLayer.load()
    await expect
      .element(doing.getByRole('button', { name: 'Drag OPS-2' }))
      .toBeVisible()

    await expect.element(limit).toHaveFocus()
    await expect.element(limit).toHaveValue(3)
    expect(requests.map(routeOf)).not.toContain(PUT)
    await userEvent.keyboard('{Enter}')
    await expect.element(doing.getByText('Max 3')).toBeVisible()
    expect(requests.map(routeOf).filter((route) => route === PUT)).toHaveLength(
      1
    )
  })

  it('keeps an open inline create and its summary when the drag layer loads', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/board')
    const doing = screen.getByRole('region', { name: 'Doing' })

    await doing.getByRole('button', { name: 'Create issue' }).click()
    const summary = doing.getByLabelText('New issue summary')
    await summary.fill('Rotate the keys')
    dragLayer.load()
    await expect
      .element(doing.getByRole('button', { name: 'Drag OPS-2' }))
      .toBeVisible()

    await expect.element(summary).toHaveFocus()
    await expect.element(summary).toHaveValue('Rotate the keys')
  })

  it('opens a column limit editor without rendering the other columns again', async () => {
    adminWithLimits()
    dragLayer.load()
    const { screen } = await renderApp('/p/OPS/board')
    const doing = screen.getByRole('region', { name: 'Doing' })
    await expect
      .element(doing.getByRole('button', { name: 'Drag OPS-2' }))
      .toBeVisible()

    await doing
      .getByRole('button', { name: 'Actions for column Doing' })
      .click()
    const setLimit = screen.getByRole('menuitem', { name: 'Set WIP limit' })
    await expect.element(setLimit).toBeVisible()
    columnRenders.clear()
    await setLimit.click()
    await expect
      .element(doing.getByLabelText('WIP limit of Doing'))
      .toHaveFocus()

    expect(
      [...columnRenders.keys()].filter((name) => name !== 'Doing')
    ).toEqual([])
  })

  it('sets the priority of one card without rendering the other cards again', async () => {
    inProjects({
      'PATCH /api/projects/OPS/issues/2': {
        status: 200,
        body: {},
        until: new Promise(() => {}),
      },
    })
    dragLayer.load()
    const { screen } = await renderApp('/p/OPS/board')
    const doing = screen.getByRole('region', { name: 'Doing' })
    await expect
      .element(doing.getByRole('button', { name: 'Drag OPS-2' }))
      .toBeVisible()

    cardRenders.clear()
    await doing
      .getByRole('combobox', { name: 'Priority of OPS-2' })
      .selectOptions('Urgent')
    await expect.element(doing.getByText('Urgent priority')).toBeInTheDocument()

    expect([...cardRenders.keys()]).toEqual(['OPS-2'])
  })
})
