import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { MEMBERS } from '@/test/stub-api'
import { MAX_RICH_TEXT } from './mention'
import { RichTextField } from './rich-text-field'

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control'

let latest = ''

const Field = ({ initial = '' }: { initial?: string }) => {
  const [value, setValue] = useState(initial)
  return (
    <RichTextField
      label='Description'
      placeholder='Add a description…'
      value={value}
      onChange={(next) => {
        latest = next
        setValue(next)
      }}
      onSubmit={() => {}}
      members={MEMBERS}
      firstIds={[]}
    />
  )
}

describe('rich text field before the editor chunk', () => {
  afterEach(() => vi.unstubAllGlobals())

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

  it('caps the textarea in characters, an emoji counting once', async () => {
    vi.stubGlobal('requestIdleCallback', () => 0)
    const initial = '😀'.repeat(MAX_RICH_TEXT - 1)
    latest = initial
    const screen = await render(<Field initial={initial} />)

    const field = screen.getByRole('textbox', { name: 'Description' })
    await field.click()
    await userEvent.keyboard('bc')

    await expect.poll(() => [...latest].length).toBe(MAX_RICH_TEXT)
    expect(latest).toContain('b')
    expect(latest).not.toContain('c')
    await expect.element(field).toHaveValue(latest)
  })

  // Last: once the chunk is in, every later field in this file starts as the editor.
  it('hands the text and the caret to the editor once its chunk is in', async () => {
    let idle = () => {}
    vi.stubGlobal('requestIdleCallback', (run: () => void) => {
      idle = run
      return 0
    })
    latest = ''
    const screen = await render(<Field />)

    const field = screen.getByRole('textbox', { name: 'Description' })
    await field.click()
    await userEvent.keyboard('Ship it{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    idle()

    await expect
      .element(screen.getByRole('toolbar', { name: 'Formatting' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('textbox', { name: 'Description' }))
      .toHaveFocus()
    await userEvent.keyboard('X')
    await expect.poll(() => latest).toBe('ShipX it')
  })
})
