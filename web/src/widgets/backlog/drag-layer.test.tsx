import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type * as SortableBacklogModule from '@/features/move-issue/sortable-backlog'
import { renderApp } from '@/test/render-app'
import { inProjects, routeOf } from '@/test/stub-api'
import type * as BacklogRowModule from './backlog-row'

const PATCH_7 = 'PATCH /api/projects/WEB/issues/7'

const dragLayer = vi.hoisted(() => ({
  ready: Promise.resolve(),
  load: () => {},
}))

const rowRenders = vi.hoisted(() => new Map<string, number>())

// The drag layer suspends until the test loads it, as its lazy chunk does in the app.
vi.mock('@/features/move-issue/sortable-backlog', async (importOriginal) => {
  const { use, createElement } = await import('react')
  const { SortableBacklog } =
    await importOriginal<typeof SortableBacklogModule>()
  return {
    SortableBacklog: (
      props: Parameters<typeof SortableBacklogModule.SortableBacklog>[0]
    ) => {
      use(dragLayer.ready)
      return createElement(SortableBacklog, props)
    },
  }
})

vi.mock('./backlog-row', async (importOriginal) => {
  const { createElement } = await import('react')
  const original = await importOriginal<typeof BacklogRowModule>()
  return {
    ...original,
    BacklogRow: (props: Parameters<typeof BacklogRowModule.BacklogRow>[0]) => {
      rowRenders.set(props.card.key, (rowRenders.get(props.card.key) ?? 0) + 1)
      return createElement(original.BacklogRow, props)
    },
  }
})

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const pendingPatch = () =>
  inProjects({
    [PATCH_7]: { status: 200, body: {}, until: new Promise(() => {}) },
  })

describe('backlog drag layer', () => {
  beforeEach(async () => {
    dragLayer.ready = new Promise((resolve) => (dragLayer.load = resolve))
    await page.viewport(1280, 800)
  })

  it('keeps an open row editor, its draft and its focus when the drag layer loads', async () => {
    const requests = pendingPatch()
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: 'Edit summary of WEB-7' }).click()
    const summary = backlog.getByRole('textbox', { name: 'Summary of WEB-7' })
    await summary.fill('Translate the docs')
    await expect
      .element(backlog.getByRole('button', { name: 'Drag WEB-7' }))
      .not.toBeInTheDocument()
    dragLayer.load()
    await expect
      .element(backlog.getByRole('button', { name: 'Drag WEB-7' }))
      .toBeVisible()

    await expect.element(summary).toHaveFocus()
    await expect.element(summary).toHaveValue('Translate the docs')
    expect(await bodiesOf(requests, PATCH_7)).toEqual([])
    await userEvent.keyboard('{Enter}')
    await expect
      .element(backlog.getByRole('link', { name: 'Translate the docs' }))
      .toBeVisible()
    expect(await bodiesOf(requests, PATCH_7)).toEqual([
      { summary: 'Translate the docs' },
    ])
  })

  it('discards a draft kept across the drag layer load on Escape', async () => {
    const requests = pendingPatch()
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: 'Edit summary of WEB-7' }).click()
    await backlog
      .getByRole('textbox', { name: 'Summary of WEB-7' })
      .fill('Translate the docs')
    dragLayer.load()
    await expect
      .element(backlog.getByRole('button', { name: 'Drag WEB-7' }))
      .toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect
      .element(backlog.getByRole('link', { name: 'Translate the help pages' }))
      .toBeVisible()
    expect(await bodiesOf(requests, PATCH_7)).toEqual([])
  })

  it('keeps an open points editor and its draft when the drag layer loads', async () => {
    const requests = pendingPatch()
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: '2 points' }).click()
    const points = backlog.getByRole('spinbutton', { name: 'Points of WEB-7' })
    await points.fill('8')
    dragLayer.load()
    await expect
      .element(backlog.getByRole('button', { name: 'Drag WEB-7' }))
      .toBeVisible()

    await expect.element(points).toHaveFocus()
    await expect.element(points).toHaveValue(8)
    await userEvent.keyboard('{Enter}')
    await expect
      .element(backlog.getByRole('button', { name: '8 points' }))
      .toBeVisible()
    expect(await bodiesOf(requests, PATCH_7)).toEqual([{ points: 8 }])
  })

  it('closes an editor whose field went away without a blur', async () => {
    const requests = pendingPatch()
    dragLayer.load()
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })
    await expect
      .element(backlog.getByRole('button', { name: 'Drag WEB-7' }))
      .toBeVisible()

    await backlog.getByRole('button', { name: 'Edit summary of WEB-7' }).click()
    const summary = backlog.getByRole('textbox', { name: 'Summary of WEB-7' })
    await expect.element(summary).toBeVisible()
    await page.viewport(375, 800)
    await expect.element(summary).not.toBeInTheDocument()
    await page.viewport(1280, 800)

    await expect
      .element(backlog.getByRole('button', { name: 'Edit summary of WEB-7' }))
      .toBeInTheDocument()
    await expect.element(summary).not.toBeInTheDocument()
    expect(await bodiesOf(requests, PATCH_7)).toEqual([])
  })

  it('opens a row editor without rendering the other rows again', async () => {
    inProjects()
    dragLayer.load()
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })
    await expect
      .element(backlog.getByRole('button', { name: 'Drag WEB-7' }))
      .toBeVisible()

    rowRenders.clear()
    await backlog.getByRole('button', { name: 'Edit summary of WEB-7' }).click()
    await expect
      .element(backlog.getByRole('textbox', { name: 'Summary of WEB-7' }))
      .toHaveFocus()

    expect([...rowRenders.keys()].filter((key) => key !== 'WEB-7')).toEqual([])
  })
})
