import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  OPS,
  OPS_BOARD,
  OPS_SETTINGS,
  inProjects,
  routeOf,
} from '@/test/stub-api'

const PUT = 'PUT /api/projects/OPS/board/columns/2'

const dragLayer = vi.hoisted(() => {
  let load = () => {}
  const loaded = new Promise<void>((resolve) => (load = resolve))
  return { loaded, load: () => load() }
})

vi.mock(
  '@/features/move-issue/sortable-board',
  async (importOriginal: () => Promise<object>) => {
    await dragLayer.loaded
    return importOriginal()
  }
)

describe('board drag layer', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('keeps an open column limit editor, its draft and its focus when the drag layer loads', async () => {
    const requests = inProjects({
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
    const { screen } = await renderApp('/p/OPS/board')
    const doing = screen.getByRole('region', { name: 'Doing' })

    await doing
      .getByRole('button', { name: 'Actions for column Doing' })
      .click()
    await screen.getByRole('menuitem', { name: 'Set WIP limit' }).click()
    const limit = doing.getByLabelText('WIP limit of Doing')
    await limit.fill('3')
    dragLayer.load()
    await expect
      .element(doing.getByRole('button', { name: 'Drag OPS-2' }))
      .toBeVisible()

    await expect.element(limit).toHaveFocus()
    await expect.element(limit).toHaveValue(3)
    expect(requests.map(routeOf)).not.toContain(PUT)
    await userEvent.keyboard('{Enter}')
    await expect.element(doing.getByText('Max 3')).toBeVisible()
  })
})
