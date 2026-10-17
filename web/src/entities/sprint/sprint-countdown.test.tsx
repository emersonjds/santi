import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Sprint } from '@/shared/api/client'
import { SprintCountdown } from './sprint-countdown'

const SPRINT: Sprint = {
  id: 4,
  name: 'Sprint 4',
  goal: '',
  state: 'active',
  overdue: false,
  starts_at: new Date(2026, 9, 16, 18, 0).toISOString(),
  ends_at: new Date(2026, 9, 16, 22, 0).toISOString(),
}

describe('sprint countdown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('counts down and announces once when the sprint turns overdue', async () => {
    vi.setSystemTime(new Date(2026, 9, 16, 21, 59))
    const screen = await render(<SprintCountdown sprint={SPRINT} />)
    const timer = screen.getByRole('timer')
    const status = screen.getByRole('status')
    expect(timer.element().textContent).toBe('1m left')
    expect(status.element().textContent).toBe('')

    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() => expect(timer.element().textContent).toBe('Overdue'))
    expect(status.element().textContent).toBe('Sprint 4 is overdue')

    await vi.advanceTimersByTimeAsync(20 * 60_000)
    await vi.waitFor(() =>
      expect(timer.element().textContent).toBe('Overdue by 20m')
    )
  })

  it('stays quiet when the sprint was already overdue', async () => {
    vi.setSystemTime(new Date(2026, 9, 16, 23, 0))
    const screen = await render(<SprintCountdown sprint={SPRINT} />)

    expect(screen.getByRole('timer').element().textContent).toBe(
      'Overdue by 1h'
    )
    expect(screen.getByRole('status').element().textContent).toBe('')
  })

  it('shows nothing for a sprint without an end', async () => {
    const { container } = await render(
      <SprintCountdown sprint={{ ...SPRINT, ends_at: null }} />
    )
    expect(container.textContent).toBe('')
  })
})
