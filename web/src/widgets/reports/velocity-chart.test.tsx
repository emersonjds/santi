import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Sprint, SprintTotals } from '@/shared/api/client'
import { VelocityChart } from './velocity-chart'

const totals = (
  id: number,
  committed: number | null,
  completed: number | null
): SprintTotals => {
  const sprint: Sprint = {
    id,
    name: `Sprint ${id}`,
    goal: '',
    state: 'closed',
    overdue: false,
  }
  return { sprint, committed, completed }
}

const SEVEN = [1, 2, 3, 4, 5, 6, 7].map((id) => totals(id, 8, id))

describe('velocity chart', () => {
  it('hides the drawing from screen readers and offers it as a table', async () => {
    const screen = await render(
      <VelocityChart
        velocity={{
          sprints: [totals(1, 8, 5), totals(2, null, 4)],
          average_completed: 4.5,
        }}
      />
    )

    expect(
      screen.container.querySelector('svg')?.getAttribute('aria-hidden')
    ).toBe('true')
    await screen.getByText('View as table').click()

    const table = screen.getByRole('table', { name: 'Velocity by sprint' })
    await expect.element(table).toBeVisible()
    expect(
      table
        .getByRole('columnheader')
        .elements()
        .map((cell) => cell.textContent)
    ).toEqual(['Sprint', 'Committed', 'Completed'])
    const rows = table
      .getByRole('row')
      .elements()
      .map((row) => row.textContent)
    expect(rows.slice(1)).toEqual(['Sprint 185', 'Sprint 2—4', 'Average4.5'])
  })

  it('shows a dash when there is no average', async () => {
    const screen = await render(
      <VelocityChart
        velocity={{ sprints: [totals(1, null, null)], average_completed: null }}
      />
    )

    await screen.getByText('View as table').click()

    await expect
      .element(screen.getByRole('row').last())
      .toHaveTextContent('Average—')
  })

  it('says so when no sprint has finished', async () => {
    const screen = await render(
      <VelocityChart velocity={{ sprints: [], average_completed: null }} />
    )

    await expect
      .element(screen.getByText('No sprint has finished yet.'))
      .toBeVisible()
  })

  it('keeps one height whatever the number of sprints', async () => {
    const one = await render(
      <VelocityChart
        velocity={{ sprints: [totals(1, 3, 3)], average_completed: 3 }}
      />
    )
    const oneHeight = one.container.getBoundingClientRect().height
    await one.unmount()
    const none = await render(
      <VelocityChart velocity={{ sprints: [], average_completed: null }} />
    )
    const noneHeight = none.container.getBoundingClientRect().height
    await none.unmount()
    const seven = await render(
      <VelocityChart velocity={{ sprints: SEVEN, average_completed: 4 }} />
    )

    expect(seven.container.getBoundingClientRect().height).toBe(oneHeight)
    expect(noneHeight).toBe(oneHeight)
    expect(
      seven.container.querySelector('svg')?.getBoundingClientRect().height
    ).toBe(160)
  })
})
