import { beforeEach, describe, expect, it } from 'vitest'
import { type Locator, page, userEvent } from 'vitest/browser'
import { issueQuery } from '@/entities/issue/issue-queries'
import { renderApp } from '@/test/render-app'
import { WEB, inProjects, problem, routeOf } from '@/test/stub-api'

const PATCH_1 = 'PATCH /api/projects/WEB/issues/1'
const PATCH_2 = 'PATCH /api/projects/WEB/issues/2'
const pending = { status: 200, body: {}, until: new Promise(() => {}) }

const focus = (locator: Locator) => (locator.element() as HTMLElement).focus()

const frame = () => new Promise(requestAnimationFrame)

/** A mouse press that slides 10px, past the drag layer's 5px threshold. */
const pressAndSlide = async (locator: Locator, drag: Locator) => {
  const element = locator.element()
  const { x, y } = element.getBoundingClientRect()
  const at = (dx: number) => ({
    bubbles: true,
    isPrimary: true,
    button: 0,
    clientX: x + 2 + dx,
    clientY: y + 2,
  })
  element.dispatchEvent(new PointerEvent('pointerdown', at(0)))
  document.dispatchEvent(new PointerEvent('pointermove', at(10)))
  await frame()
  await frame()
  expect(drag.element().getAttribute('aria-pressed')).not.toBe('true')
  document.dispatchEvent(new PointerEvent('pointerup', at(10)))
}

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

describe('points and priority on a board card (SAN-95)', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('shows the points pill on every card, with a dash when empty', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const todo = screen.getByRole('region', { name: 'To do' })

    const empty = todo.getByRole('button', { name: 'Add points to WEB-1' })
    await expect
      .element(empty.getByTitle('Story points'))
      .toHaveTextContent('–')
    await expect
      .element(todo.getByRole('button', { name: '3 points' }))
      .toBeVisible()
    await expect
      .element(todo.getByRole('combobox', { name: 'Priority of WEB-2' }))
      .toHaveValue('urgent')
  })

  it('sets points and priority at once, taking back what the server refuses', async () => {
    let refuse = () => {}
    const requests = inProjects({
      [PATCH_1]: pending,
      [PATCH_2]: {
        status: 403,
        body: problem(403, 'You are not allowed to do this.'),
        until: new Promise<void>((resolve) => (refuse = resolve)),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    const todo = screen.getByRole('region', { name: 'To do' })

    await todo.getByRole('button', { name: 'Add points to WEB-1' }).click()
    await todo.getByRole('spinbutton', { name: 'Points of WEB-1' }).fill('5')
    await userEvent.keyboard('{Enter}')
    await todo
      .getByRole('combobox', { name: 'Priority of WEB-1' })
      .selectOptions('High')

    const first = todo.getByRole('article').first()
    await expect
      .element(first.getByRole('button', { name: '5 points' }))
      .toBeVisible()
    await expect.element(first.getByText('High priority')).toBeInTheDocument()
    await expect
      .poll(() => bodiesOf(requests, PATCH_1))
      .toEqual([{ points: 5 }, { priority: 'high' }])

    await todo
      .getByRole('combobox', { name: 'Priority of WEB-2' })
      .selectOptions('Low')
    await expect
      .element(todo.getByRole('article').nth(1).getByText('Low priority'))
      .toBeInTheDocument()
    refuse()

    await expect
      .element(screen.getByText('You are not allowed to do this.'))
      .toBeVisible()
    await expect
      .element(todo.getByRole('combobox', { name: 'Priority of WEB-2' }))
      .toHaveValue('urgent')
    expect(await bodiesOf(requests, PATCH_2)).toEqual([{ priority: 'low' }])
  })

  it('takes back points the server refuses', async () => {
    let refuse = () => {}
    inProjects({
      [PATCH_2]: {
        status: 403,
        body: problem(403, 'You are not allowed to do this.'),
        until: new Promise<void>((resolve) => (refuse = resolve)),
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    const todo = screen.getByRole('region', { name: 'To do' })

    await todo.getByRole('button', { name: '3 points' }).click()
    await todo.getByRole('spinbutton', { name: 'Points of WEB-2' }).fill('8')
    await userEvent.keyboard('{Enter}')
    await expect
      .element(todo.getByRole('button', { name: '8 points' }))
      .toBeVisible()
    refuse()

    await expect
      .element(screen.getByText('You are not allowed to do this.'))
      .toBeVisible()
    await expect
      .element(todo.getByRole('button', { name: '3 points' }))
      .toBeVisible()
  })

  it('marks the open issue stale once a card edit lands', async () => {
    inProjects({ [PATCH_1]: { status: 200, body: {} } })
    const { screen, queryClient } = await renderApp('/p/WEB/board')
    const issue = issueQuery('WEB', 1)
    await queryClient.prefetchQuery(issue)
    const todo = screen.getByRole('region', { name: 'To do' })

    await todo
      .getByRole('combobox', { name: 'Priority of WEB-1' })
      .selectOptions('High')

    await expect
      .poll(() => queryClient.getQueryState(issue.queryKey)?.isInvalidated)
      .toBe(true)
  })

  it('sends nothing on Esc, a negative or an unreadable estimate', async () => {
    const requests = inProjects({ [PATCH_2]: pending })
    const { screen } = await renderApp('/p/WEB/board')
    const todo = screen.getByRole('region', { name: 'To do' })

    await todo.getByRole('button', { name: '3 points' }).click()
    await todo.getByRole('spinbutton', { name: 'Points of WEB-2' }).fill('8')
    await userEvent.keyboard('{Escape}')
    await todo.getByRole('button', { name: '3 points' }).click()
    await todo.getByRole('spinbutton', { name: 'Points of WEB-2' }).fill('-1')
    await userEvent.keyboard('{Enter}')
    await todo.getByRole('button', { name: '3 points' }).click()
    const field = todo.getByRole('spinbutton', { name: 'Points of WEB-2' })
    await field.clear()
    await userEvent.type(field, '-')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(todo.getByRole('button', { name: '3 points' }))
      .toBeVisible()
    expect(await bodiesOf(requests, PATCH_2)).toEqual([])
  })

  it('edits without opening the issue or picking the card up', async () => {
    inProjects({ [PATCH_1]: pending })
    const { screen, router } = await renderApp('/p/WEB/board')
    const todo = screen.getByRole('region', { name: 'To do' })
    const drag = todo.getByRole('button', { name: 'Drag WEB-1' })
    await expect.element(drag).toBeVisible()

    await todo.getByRole('button', { name: 'Add points to WEB-1' }).click()
    await expect
      .element(todo.getByRole('spinbutton', { name: 'Points of WEB-1' }))
      .toHaveFocus()
    await userEvent.keyboard('{Escape}')

    focus(todo.getByRole('link', { name: 'Write the release notes' }))
    await userEvent.keyboard('{Tab}')
    const pill = todo.getByRole('button', { name: 'Add points to WEB-1' })
    await expect.element(pill).toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect
      .element(todo.getByRole('combobox', { name: 'Priority of WEB-1' }))
      .toHaveFocus()
    focus(pill)
    await userEvent.keyboard('[Space]')
    await expect
      .element(todo.getByRole('spinbutton', { name: 'Points of WEB-1' }))
      .toHaveFocus()

    await expect.element(drag).not.toHaveAttribute('aria-pressed', 'true')
    expect(router.state.location.search).not.toHaveProperty('issue')
    expect(screen.getByRole('dialog').elements()).toEqual([])
  })

  it('lets a mouse press slide inside the fields without picking the card up', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const todo = screen.getByRole('region', { name: 'To do' })
    const drag = todo.getByRole('button', { name: 'Drag WEB-1' })
    await expect.element(drag).toBeVisible()

    const pill = todo.getByRole('button', { name: 'Add points to WEB-1' })
    await pressAndSlide(pill, drag)
    await pressAndSlide(
      todo.getByRole('combobox', { name: 'Priority of WEB-1' }),
      drag
    )
    await pill.click()
    await pressAndSlide(
      todo.getByRole('spinbutton', { name: 'Points of WEB-1' }),
      drag
    )
  })

  it('shows a static pill and glyph on an archived project', async () => {
    inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived' },
      },
    })
    const { screen } = await renderApp('/p/WEB/board')
    const bug = screen
      .getByRole('region', { name: 'To do' })
      .getByRole('article')
      .nth(1)

    await expect.element(bug.getByLabelText('3 points')).toBeVisible()
    await expect.element(bug.getByText('Urgent priority')).toBeInTheDocument()
    expect(bug.getByRole('button', { name: '3 points' }).elements()).toEqual([])
    expect(bug.getByRole('combobox').elements()).toEqual([])
  })
})
