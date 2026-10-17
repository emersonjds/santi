import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects, routeOf } from '@/test/stub-api'

const PATCH_7 = 'PATCH /api/projects/WEB/issues/7'

const dragLayer = vi.hoisted(() => {
  let load = () => {}
  const loaded = new Promise<void>((resolve) => (load = resolve))
  return { loaded, load: () => load() }
})

vi.mock(
  '@/features/move-issue/sortable-backlog',
  async (importOriginal: () => Promise<object>) => {
    await dragLayer.loaded
    return importOriginal()
  }
)

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

describe('backlog drag layer', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('keeps an open row editor, its draft and its focus when the drag layer loads', async () => {
    const requests = inProjects({
      [PATCH_7]: { status: 200, body: {}, until: new Promise(() => {}) },
    })
    const { screen } = await renderApp('/p/WEB/backlog')
    const backlog = screen.getByRole('region', { name: 'Backlog' })

    await backlog.getByRole('button', { name: 'Edit summary of WEB-7' }).click()
    const summary = backlog.getByRole('textbox', { name: 'Summary of WEB-7' })
    await summary.fill('Translate the docs')
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
})
