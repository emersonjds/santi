import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects } from '@/test/stub-api'

describe('board on a phone', () => {
  it('shows one column at a time, picked by name with its count', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/board')

    const picker = screen.getByRole('navigation', { name: 'Columns' })
    await expect
      .element(picker.getByRole('link', { name: 'To do 2' }))
      .toHaveAttribute('aria-current', 'true')
    await expect
      .element(screen.getByRole('region', { name: 'To do' }))
      .toBeVisible()
    await expect
      .element(
        screen.getByRole('region', { name: 'In progress', includeHidden: true })
      )
      .not.toBeVisible()

    await picker.getByRole('link', { name: 'In progress 1' }).click()

    await expect
      .element(screen.getByRole('region', { name: 'In progress' }))
      .toBeVisible()
    await expect
      .element(
        screen.getByRole('region', { name: 'To do', includeHidden: true })
      )
      .not.toBeVisible()
    expect(router.state.location.search).toEqual({ column: 2 })
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
  })

  it('hides the picker on a wide screen', async () => {
    await page.viewport(1280, 800)
    inProjects()
    const { screen } = await renderApp('/p/WEB/board?column=2')

    await expect
      .element(screen.getByRole('region', { name: 'To do' }))
      .toBeVisible()
    await expect
      .element(
        screen.getByRole('navigation', { name: 'Columns', includeHidden: true })
      )
      .not.toBeVisible()
  })
})
