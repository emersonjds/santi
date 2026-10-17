import { beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import type { ReportGroup } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import { inProjects, reportIssue, sprintReport } from '@/test/stub-api'

const REPORT = 'GET /api/projects/WEB/sprints/3/report'

const withGroups = (groups: ReportGroup[]) =>
  inProjects({
    [REPORT]: { status: 200, body: sprintReport(3, { groups }) },
  })

const group = (
  outcome: ReportGroup['outcome'],
  fields: Partial<ReportGroup> = {}
): ReportGroup => ({
  outcome,
  points_at_start: null,
  points_at_end: null,
  issues: [],
  deleted: null,
  ...fields,
})

const GROUPS: ReportGroup[] = [
  group('completed', {
    points_at_start: 3,
    points_at_end: 5,
    issues: [
      reportIssue({
        key: 'WEB-1',
        summary: 'Write the release notes',
        epic_key: 'WEB-9',
        epic_summary: 'Launch',
        points_at_start: 3,
        points_at_end: 5,
        added_after_start: true,
      }),
    ],
  }),
  group('not_completed', {
    points_at_start: 4,
    points_at_end: 1,
    deleted: { points_at_start: 4, points_at_end: 1 },
  }),
  group('removed', {
    points_at_start: 2,
    issues: [
      reportIssue({
        key: 'WEB-7',
        summary: 'Drop the old footer',
        status_name: 'To Do',
        status_category: 'todo',
        points_at_start: 2,
        points_at_end: null,
      }),
    ],
  }),
]

const region =
  (screen: Awaited<ReturnType<typeof renderApp>>['screen']) => (name: string) =>
    screen.getByRole('region', { name, exact: true })

describe('report groups', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('shows the three groups in order, an empty one saying so', async () => {
    withGroups([group('completed'), group('not_completed'), group('removed')])
    const { screen } = await renderApp('/p/WEB/reports/3')

    const titles = screen.getByRole('heading', { level: 2 })
    await expect.element(titles.first()).toHaveTextContent('Completed')
    expect(titles.elements().map((title) => title.textContent)).toEqual([
      'Completed',
      'Not completed',
      'Removed from sprint',
    ])
    for (const name of ['Completed', 'Not completed', 'Removed from sprint'])
      await expect
        .element(region(screen)(name).getByText('No issues'))
        .toBeVisible()
  })

  it('draws each row with its points, the added badge and the deleted line', async () => {
    withGroups(GROUPS)
    const { screen } = await renderApp('/p/WEB/reports/3')

    const completed = region(screen)('Completed')
    await expect.element(completed.getByRole('list')).not.toHaveAccessibleName()
    const row = completed.getByRole('listitem')
    await expect.element(row).toHaveTextContent('WEB-1')
    await expect.element(row).toHaveTextContent('Write the release notes')
    await expect.element(row).toHaveTextContent('Launch')
    await expect.element(row).toHaveTextContent('Done')
    await expect.element(row).toHaveTextContent('3 → 5')
    await expect.element(row.getByText('Added', { exact: true })).toBeVisible()
    await expect
      .element(row.getByText('Added after the sprint started'))
      .toBeInTheDocument()
    await expect.element(completed).toHaveTextContent('3 → 5 points')

    const removed = region(screen)('Removed from sprint')
    await expect
      .element(removed.getByRole('listitem'))
      .toHaveTextContent('2 → —')
    await expect.element(removed).toHaveTextContent('2 → — points')

    const notCompleted = region(screen)('Not completed')
    const deleted = notCompleted.getByText('Deleted issues')
    await expect.element(deleted).toBeVisible()
    await expect.element(notCompleted).toHaveTextContent('4 → 1')
    expect(notCompleted.getByRole('link').elements()).toHaveLength(0)
    expect(notCompleted.getByText('No issues').elements()).toHaveLength(0)
  })

  it('opens an issue over the report from its key', async () => {
    withGroups(GROUPS)
    const { screen, router } = await renderApp('/p/WEB/reports/3')

    await region(screen)('Completed')
      .getByRole('link', { name: 'WEB-1' })
      .click()

    await expect
      .poll(() => router.state.location.maskedLocation?.pathname)
      .toBe('/p/WEB/issues/1')
    expect(router.state.location.search).toEqual({ issue: 1 })
    await expect
      .element(screen.getByRole('dialog', { name: 'WEB-1' }))
      .toBeVisible()
  })

  it('shows the first 50 rows, then all of them on demand', async () => {
    const issues = Array.from({ length: 60 }, (_, index) =>
      reportIssue({ key: `WEB-${index + 1}`, summary: `Task ${index + 1}` })
    )
    withGroups([
      group('completed', { issues }),
      group('not_completed'),
      group('removed'),
    ])
    const { screen } = await renderApp('/p/WEB/reports/3')

    const completed = region(screen)('Completed')
    await expect.element(completed.getByText('Task 50')).toBeVisible()
    expect(completed.getByRole('listitem').elements()).toHaveLength(50)
    await completed.getByRole('button', { name: 'Show all 60' }).click()

    await expect.element(completed.getByText('Task 60')).toBeVisible()
    expect(completed.getByRole('listitem').elements()).toHaveLength(60)
    expect(
      completed.getByRole('button', { name: /Show all/ }).elements()
    ).toHaveLength(0)
  })

  it('stacks rows at 375px, each one a thumb can hit', async () => {
    await page.viewport(375, 800)
    withGroups(GROUPS)
    const { screen } = await renderApp('/p/WEB/reports/3')

    await expect
      .element(region(screen)('Completed').getByRole('listitem'))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    const rows = ['Completed', 'Removed from sprint'].flatMap((name) =>
      region(screen)(name).getByRole('listitem').elements()
    )
    const deleted = region(screen)('Not completed').getByText('Deleted issues')
    for (const row of [...rows, deleted.element()])
      expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })
})
