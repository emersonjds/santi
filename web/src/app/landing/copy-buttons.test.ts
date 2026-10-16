import { afterEach, describe, expect, it, vi } from 'vitest'
import { wireCopyButtons } from './copy-buttons'

const mount = () => {
  const root = document.createElement('div')
  root.innerHTML =
    '<button type="button" data-copy="docker compose up -d">Copy</button>'
  document.body.append(root)
  return root.querySelector('button') as HTMLButtonElement
}

describe('landing copy buttons', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('copies the command and says so, then resets the label', async () => {
    vi.useFakeTimers()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue()
    const button = mount()
    wireCopyButtons(document)

    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe('Copied'))

    expect(writeText).toHaveBeenCalledWith('docker compose up -d')
    vi.advanceTimersByTime(2000)
    expect(button.textContent).toBe('Copy')
  })

  it('tells the reader when the browser refuses to copy', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    )
    const button = mount()
    wireCopyButtons(document)

    button.click()

    await vi.waitFor(() => expect(button.textContent).toBe('Select and copy'))
  })
})
