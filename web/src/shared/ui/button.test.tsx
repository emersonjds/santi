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

const luminance = (color: string) => {
  const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? [])
    .slice(0, 3)
    .map((channel) => {
      const value = Number(channel) / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (first: string, second: string) => {
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a
  )
  return (light + 0.05) / (dark + 0.05)
}

describe('Primary button in the dark theme', () => {
  it('has white text that passes AA contrast on its fill', async () => {
    document.documentElement.dataset.theme = 'dark'
    try {
      const screen = await render(<Button>Create</Button>)
      const style = getComputedStyle(screen.getByRole('button').element())
      expect(style.color).toBe('rgb(255, 255, 255)')
      expect(
        contrast(style.color, style.backgroundColor)
      ).toBeGreaterThanOrEqual(4.5)
    } finally {
      delete document.documentElement.dataset.theme
    }
  })
})
