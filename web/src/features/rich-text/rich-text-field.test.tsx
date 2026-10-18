import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { MEMBERS } from '@/test/stub-api'
import { RichTextField } from './rich-text-field'


const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control'

describe('rich text field before the editor chunk', () => {
  it('is a working textarea that saves with Mod-Enter and cancels with Esc', async () => {
    // The page never goes idle, so the editor chunk is never fetched.
    vi.stubGlobal('requestIdleCallback', () => 0)
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const Harness = () => {
      const [value, setValue] = useState('')
      return (
        <RichTextField
          label='Description'
          placeholder='Add a description…'
          value={value}
          onChange={setValue}
          onSubmit={onSubmit}
          onCancel={onCancel}
          members={MEMBERS}
          firstIds={[]}
        />
      )
    }
    const screen = await render(<Harness />)

    const field = screen.getByRole('textbox', { name: 'Description' })
    await expect
      .element(field)
      .toHaveAttribute('placeholder', 'Add a description…')
    await field.click()
    await userEvent.keyboard('Ship **it**')
    await expect.element(field).toHaveValue('Ship **it**')
    expect(field.element().tagName).toBe('TEXTAREA')

    await userEvent.keyboard(`{${MOD}>}{Enter}{/${MOD}}`)
    expect(onSubmit).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    await expect.element(field).toHaveValue('Ship **it**')
  })
})
