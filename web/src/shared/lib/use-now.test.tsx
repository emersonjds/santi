import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useNow } from './use-now'

const Clock = () => <p>{new Date(useNow()).toTimeString().slice(0, 8)}</p>

describe('useNow', () => {
  afterEach(() => vi.useRealTimers())

  it('ticks on each minute boundary and stops on unmount', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 16, 18, 0, 42))
    const { container, unmount } = await render(<Clock />)
    expect(container.textContent).toBe('18:00:42')

    await vi.advanceTimersByTimeAsync(17_999)
    expect(container.textContent).toBe('18:00:42')
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(container.textContent).toBe('18:01:00'))
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() => expect(container.textContent).toBe('18:02:00'))

    await unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
