import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects } from '@/test/stub-api'

const WIDTH_KEY = 'sidebar-width'

const handle = (screen: RenderResult) =>
  screen.getByRole('separator', { name: 'Resize the sidebar' })

const sidebarWidth = () =>
  document
    .querySelector('[data-slot=sidebar-container]')
    ?.getBoundingClientRect().width

const shown = async (screen: RenderResult) => {
  await expect.element(handle(screen)).toBeInTheDocument()
  return handle(screen).element()
}

const pointer = (type: string, target: EventTarget, clientX: number) =>
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, clientX, pointerId: 1 })
  )

describe('sidebar width', () => {
  beforeEach(() => page.viewport(1280, 800))
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('opens at 320px with a labelled vertical separator from 200 to 500', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    const separator = await shown(screen)
    expect(separator.getAttribute('aria-orientation')).toBe('vertical')
    expect(separator.getAttribute('aria-valuemin')).toBe('200')
    expect(separator.getAttribute('aria-valuemax')).toBe('500')
    expect(separator.getAttribute('aria-valuenow')).toBe('320')
    expect(separator.getBoundingClientRect().width).toBe(24)
    await expect.poll(sidebarWidth).toBe(320)
  })

  it('opens at the stored width after a reload', async () => {
    localStorage.setItem(WIDTH_KEY, '400')
    inProjects()
    const { screen } = await renderApp('/')

    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '400')
    await expect.poll(sidebarWidth).toBe(400)
  })

  it('falls back to 320px for a stored width out of range or unreadable', async () => {
    localStorage.setItem(WIDTH_KEY, '900')
    inProjects()
    const { screen } = await renderApp('/')

    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '320')
  })

  it('falls back to 320px and still resizes when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    inProjects()
    const { screen } = await renderApp('/')

    const separator = await shown(screen)
    expect(separator.getAttribute('aria-valuenow')).toBe('320')
    separator.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '340')
  })

  it('steps 20px with the arrow keys, within 200 to 500, and stores it', async () => {
    localStorage.setItem(WIDTH_KEY, '480')
    inProjects()
    const { screen } = await renderApp('/')

    const separator = await shown(screen)
    separator.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '500')
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '500')
    expect(localStorage.getItem(WIDTH_KEY)).toBe('500')
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '480')
    expect(localStorage.getItem(WIDTH_KEY)).toBe('480')
  })

  it('follows a drag, within 200 to 500, and stores where it stops', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    const separator = await shown(screen)
    pointer('pointerdown', separator, 320)
    pointer('pointermove', window, 420)
    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '420')
    pointer('pointermove', window, 80)
    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '200')
    pointer('pointermove', window, 450)
    pointer('pointerup', window, 450)
    pointer('pointermove', window, 300)

    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '450')
    expect(localStorage.getItem(WIDTH_KEY)).toBe('450')
    await expect.poll(sidebarWidth).toBe(450)
  })

  it('collapses on a double-click and comes back at the same width', async () => {
    localStorage.setItem(WIDTH_KEY, '380')
    inProjects()
    const { screen } = await renderApp('/')

    await userEvent.dblClick(await shown(screen))
    await expect
      .element(screen.getByRole('navigation', { name: 'Projects and pages' }))
      .not.toBeInViewport()
    await screen.getByRole('button', { name: 'Toggle Sidebar' }).click()

    await expect.element(handle(screen)).toHaveAttribute('aria-valuenow', '380')
    await expect.poll(sidebarWidth).toBe(380)
  })

  it('closes an open flyout when a resize starts', async () => {
    inProjects()
    const { screen } = await renderApp('/')

    // The open flyout hides the sidebar from the accessibility tree.
    const separator = await shown(screen)
    await screen.getByRole('button', { name: 'Recent' }).click()
    await expect
      .element(screen.getByRole('dialog', { name: 'Recent' }))
      .toBeVisible()
    await userEvent.click(separator)

    await expect
      .element(screen.getByRole('dialog', { name: 'Recent' }))
      .not.toBeInTheDocument()
  })

  it('opens a flyout beside the sidebar at any width', async () => {
    localStorage.setItem(WIDTH_KEY, '440')
    inProjects()
    const { screen } = await renderApp('/')

    await expect.poll(sidebarWidth).toBe(440)
    await screen.getByRole('button', { name: 'Recent' }).click()
    const flyout = screen.getByRole('dialog', { name: 'Recent' })
    await expect.element(flyout).toBeVisible()

    expect(flyout.element().getBoundingClientRect().left).toBe(440)
  })

  it('has no handle on a phone', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('button', { name: 'Toggle Sidebar' }))
      .toBeVisible()
    expect(document.querySelector('[role=separator][aria-valuenow]')).toBeNull()
  })
})
