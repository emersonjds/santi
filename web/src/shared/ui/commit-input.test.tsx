import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { CommitTextarea } from './commit-input'

const longTitle =
  '[Back] - DELETE /imagem apaga o arquivo antes do registro no banco e deixa o card sem anexo depois'

describe('CommitTextarea', () => {
  it('shows a long value whole, wrapping instead of scrolling sideways', async () => {
    const { getByRole } = await render(
      <div style={{ width: 240 }}>
        <CommitTextarea
          aria-label='Summary'
          value={longTitle}
          onCommit={vi.fn()}
        />
      </div>
    )
    const field = getByRole('textbox', { name: 'Summary' })
    await expect.element(field).toHaveValue(longTitle)
    const element = field.element() as HTMLTextAreaElement
    expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth)
    expect(element.scrollHeight).toBeLessThanOrEqual(element.clientHeight + 1)
  })

  it('saves the trimmed text on Enter without adding a line break', async () => {
    const onCommit = vi.fn()
    const { getByRole } = await render(
      <CommitTextarea aria-label='Summary' value='Old' onCommit={onCommit} />
    )
    const field = getByRole('textbox', { name: 'Summary' })
    await userEvent.clear(field)
    await userEvent.type(field, '  New title  {Enter}')
    expect(onCommit).toHaveBeenCalledWith('New title')
    await expect.element(field).toHaveValue('  New title  ')
  })

  it('ignores Shift+Enter and turns pasted line breaks into spaces', async () => {
    const onCommit = vi.fn()
    const { getByRole } = await render(
      <CommitTextarea aria-label='Summary' value='One' onCommit={onCommit} />
    )
    const field = getByRole('textbox', { name: 'Summary' })
    await userEvent.click(field)
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await expect.element(field).toHaveValue('One')
    await userEvent.clear(field)
    await userEvent.fill(field, 'two\nlines')
    await expect.element(field).toHaveValue('two lines')
    expect(onCommit).not.toHaveBeenCalled()
  })
})
