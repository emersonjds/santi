import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects } from '@/test/stub-api'

const CONTROLS =
  'a, button, input, select, textarea, [role=button], [role=combobox]'

/** R-8: what a thumb can hit, under 44px. Stretched links take their card's box; the skip link is keyboard only. */
const smallTargets = () =>
  [...document.querySelectorAll<HTMLElement>(CONTROLS)].flatMap((control) => {
    const box = control.getBoundingClientRect()
    const exempt =
      control.className.includes('after:inset-0') ||
      control.className.includes('sr-only') ||
      control.closest('[aria-hidden=true]')
    if (exempt || box.width === 0 || (box.width >= 44 && box.height >= 44))
      return []
    const name = control.getAttribute('aria-label') ?? control.textContent
    return [`${name} ${Math.round(box.width)}x${Math.round(box.height)}`]
  })

describe('touch targets at 375px', () => {
  it.each([
    ['/p/WEB/board', 'Actions for WEB-1'],
    ['/p/WEB/backlog', 'Actions for WEB-6'],
    ['/p/WEB/issues/1', 'Add subtask'],
    ['/p/WEB/settings/members', 'Remove Bob Stone'],
  ])('%s has none under 44px', async (path, lastToLoad) => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp(path)

    await expect
      .element(screen.getByRole('button', { name: lastToLoad }))
      .toBeVisible()
    expect(smallTargets()).toEqual([])
  })
})
