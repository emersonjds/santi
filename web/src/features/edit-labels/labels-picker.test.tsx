import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { WEB_ISSUE, inProjects, problem, routeOf } from '@/test/stub-api'

const PATCH = 'PATCH /api/projects/WEB/issues/1'
const pending = { status: 200, body: {}, until: new Promise(() => {}) }

const bodiesOf = (requests: Request[]) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === PATCH)
      .map((request) => request.clone().json())
  )

const withLabels = (labels: string[]) => ({
  'GET /api/projects/WEB/issues/1': {
    status: 200,
    body: { ...WEB_ISSUE, labels },
  },
})

const openIssue = async (replies = {}) => {
  const requests = inProjects({ [PATCH]: pending, ...replies })
  const { screen } = await renderApp('/p/WEB/issues/1')
  const trigger = screen.getByRole('button', { name: 'Add label' })
  await expect.element(trigger).toBeVisible()
  return { requests, screen, trigger }
}

const options = (screen: RenderResult) =>
  screen.getByRole('listbox').getByRole('option')

const optionTexts = (screen: RenderResult) =>
  options(screen)
    .elements()
    .map((option) => option.textContent)

const search = (screen: RenderResult) =>
  screen.getByRole('combobox', { name: 'Search labels' })

describe('labels picker', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('lists the issue labels, the project ones A-Z, then unused defaults; arrows and Enter add at once', async () => {
    const { requests, screen, trigger } = await openIssue()

    await expect.element(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    await trigger.click()
    await expect.element(search(screen)).toHaveFocus()
    expect(optionTexts(screen)).toEqual([
      'docs (added)',
      'ui',
      'bug',
      'feature',
      'frontend',
      'backend',
      'mobile',
      'infra',
      'design',
      'tech-debt',
      'security',
      'performance',
      'blocked',
    ])
    expect(
      options(screen).nth(1).element().querySelector('[data-slot=label-chip]')
    ).toHaveClass('bg-label-sky-bg', 'text-label-sky')
    expect(
      options(screen).nth(0).element().querySelector('[data-slot=label-chip]')
    ).toHaveTextContent(/^docs$/)

    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect
      .element(screen.getByRole('button', { name: 'Remove label ui' }))
      .toBeVisible()
    await userEvent.keyboard('fea{Enter}')

    await expect
      .poll(() => bodiesOf(requests))
      .toEqual([
        { labels: ['docs', 'ui'] },
        { labels: ['docs', 'ui', 'feature'] },
      ])
    await expect
      .element(screen.getByRole('button', { name: 'Remove label feature' }))
      .toBeVisible()
    await expect
      .element(screen.getByText('Label feature added'))
      .toBeInTheDocument()
  })

  it('creates a label the project lacks, and ignores a pick it already has in any case', async () => {
    const { requests, screen, trigger } = await openIssue()

    await trigger.click()
    await userEvent.keyboard('DOCS')
    await expect.poll(() => optionTexts(screen)).toEqual(['docs (added)'])
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('Release')
    await expect
      .element(options(screen).filter({ hasText: 'Create label Release' }))
      .toBeVisible()
    await userEvent.keyboard('{Enter}')

    await expect
      .poll(() => bodiesOf(requests))
      .toEqual([{ labels: ['docs', 'Release'] }])
    await expect
      .element(screen.getByRole('button', { name: 'Remove label Release' }))
      .toBeVisible()
  })

  it('says why text cannot be a label and offers no create row', async () => {
    const { requests, screen, trigger } = await openIssue()

    await trigger.click()
    await userEvent.keyboard('two words')
    await expect
      .element(screen.getByText('Labels are single words, no spaces.'))
      .toBeVisible()
    expect(options(screen).elements()).toHaveLength(0)
    await userEvent.keyboard('{Enter}')
    await search(screen).fill('x'.repeat(51))
    await expect
      .element(screen.getByText('Use at most 50 characters.'))
      .toBeVisible()
    expect(options(screen).elements()).toHaveLength(0)

    expect(await bodiesOf(requests)).toEqual([])
  })

  it('removes a label with its x, and the last one with Backspace in the empty search', async () => {
    const { requests, screen, trigger } = await openIssue(
      withLabels(['docs', 'ui'])
    )

    const remove = screen.getByRole('button', { name: 'Remove label docs' })
    expect(remove.element().closest('[data-slot=label-chip]')).toHaveClass(
      'bg-label-amber-bg',
      'text-label-amber',
      'pe-0'
    )
    await remove.click()
    await expect
      .element(screen.getByText('Label docs removed'))
      .toBeInTheDocument()
    await trigger.click()
    await userEvent.keyboard('{Backspace}')

    await expect
      .poll(() => bodiesOf(requests))
      .toEqual([{ labels: ['ui'] }, { labels: [] }])
    await expect
      .element(screen.getByText('Label ui removed'))
      .toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Remove label/ }).elements()
    ).toHaveLength(0)
  })

  it('closes on Esc and gives the focus back to the trigger', async () => {
    const { screen, trigger } = await openIssue()

    await trigger.click()
    await expect.element(screen.getByRole('listbox')).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(screen.getByRole('listbox')).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()
  })

  it('takes a refused label back and says why next to the field', async () => {
    const { screen, trigger } = await openIssue({
      [PATCH]: {
        status: 422,
        body: problem(422, 'Check the fields.', [
          { field: 'labels', message: 'an issue takes at most 20 labels' },
        ]),
      },
    })

    await trigger.click()
    await userEvent.keyboard('ui{Enter}')

    await expect
      .element(screen.getByText('an issue takes at most 20 labels'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Remove label ui' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Remove label docs' }))
      .toBeVisible()
  })

  it('truncates a long label, the full text on hover', async () => {
    const long = 'a'.repeat(50)
    const { screen } = await openIssue(withLabels([long]))

    const chip = screen.getByTitle(long)
    await expect.element(chip).toBeVisible()
    expect(chip.element().scrollWidth).toBeGreaterThan(
      chip.element().clientWidth
    )
  })

  it('fits a phone: 44px targets, a 16px search and a 16px gutter', async () => {
    await page.viewport(375, 800)
    const { screen, trigger } = await openIssue()

    const remove = screen
      .getByRole('button', { name: 'Remove label docs' })
      .element()
      .getBoundingClientRect()
    expect(Math.min(remove.width, remove.height)).toBeGreaterThanOrEqual(44)
    expect(
      trigger.element().getBoundingClientRect().height
    ).toBeGreaterThanOrEqual(44)

    await trigger.click()
    await expect.element(search(screen)).toBeVisible()
    expect(getComputedStyle(search(screen).element()).fontSize).toBe('16px')
    const popover = screen.getByRole('dialog').element().getBoundingClientRect()
    expect(popover.left).toBeGreaterThanOrEqual(16)
    expect(popover.right).toBeLessThanOrEqual(375 - 16)
  })

  it('scrolls a long list with the wheel inside the issue dialog', async () => {
    const many = Array.from({ length: 30 }, (_, at) => `label-${at + 10}`)
    inProjects({
      'GET /api/projects/WEB/labels': { status: 200, body: many },
    })
    const { screen } = await renderApp('/p/WEB/board?issue=1')
    await screen.getByRole('button', { name: 'Add label' }).click()
    const list = screen.getByRole('listbox')
    await expect.element(list).toBeVisible()

    await userEvent.wheel(list, { delta: { y: 200 } })

    await expect.poll(() => list.element().scrollTop).toBeGreaterThan(0)
  })

  it('leaves a touch drag on the list to the browser on a phone', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/p/WEB/board?issue=1')
    await screen.getByRole('button', { name: 'Add label' }).click()
    const list = screen.getByRole('listbox').element()
    const touch = (y: number) => [
      new Touch({ identifier: 1, target: list, clientX: 100, clientY: y }),
    ]
    const drag = (type: string, y: number) =>
      list.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: touch(y),
          changedTouches: touch(y),
        })
      )

    drag('touchstart', 300)

    expect(drag('touchmove', 200)).toBe(true)
  })
})
