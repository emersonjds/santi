import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ReadOnly } from '@/shared/lib/read-only'
import { Button } from './button'
import { Input } from './input'
import { NativeSelect } from './native-select'

describe('Button inside a read-only area', () => {
  it('keeps its own description and adds the note', async () => {
    const screen = await render(
      <ReadOnly value='note'>
        <Button aria-describedby='hint'>Save</Button>
      </ReadOnly>
    )

    await expect
      .element(screen.getByRole('button', { name: 'Save' }))
      .toHaveAttribute('aria-describedby', 'hint note')
  })

  it('stops a link it wraps before the link reacts', async () => {
    const follow = vi.fn()
    const screen = await render(
      <ReadOnly value='note'>
        <Button asChild>
          <a href='#elsewhere' onClick={follow}>
            Elsewhere
          </a>
        </Button>
      </ReadOnly>
    )

    // Playwright counts aria-disabled as disabled; a user can still click.
    await screen.getByRole('link', { name: 'Elsewhere' }).click({ force: true })

    expect(follow).not.toHaveBeenCalled()
    expect(location.hash).not.toBe('#elsewhere')
  })

  it('works as usual outside a read-only area', async () => {
    const follow = vi.fn()
    const screen = await render(
      <Button asChild>
        <a href='#open' onClick={follow}>
          Open
        </a>
      </Button>
    )

    await screen.getByRole('link', { name: 'Open' }).click()

    expect(follow).toHaveBeenCalledOnce()
  })
})

describe('fields inside a read-only area', () => {
  it('keep their own description and add the note', async () => {
    const screen = await render(
      <ReadOnly value='note'>
        <Input aria-label='Name' aria-describedby='rule' />
        <NativeSelect aria-label='Kind' aria-describedby='rule' value='a'>
          <option value='a'>A</option>
        </NativeSelect>
      </ReadOnly>
    )

    await expect
      .element(screen.getByRole('textbox', { name: 'Name' }))
      .toHaveAttribute('aria-describedby', 'rule note')
    await expect
      .element(screen.getByRole('combobox', { name: 'Kind' }))
      .toHaveAttribute('aria-describedby', 'rule note')
  })
})
