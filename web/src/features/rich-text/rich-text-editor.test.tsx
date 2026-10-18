import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Member } from '@/shared/api/client'
import { MAX_RICH_TEXT } from './mention'
import { RichTextEditor, type RichTextEditorProps } from './rich-text-editor'

const PEOPLE: Member[] = [
  {
    user_id: 1,
    email: 'alice@example.com',
    display_name: 'Alice',
    role: 'admin',
  },
  {
    user_id: 2,
    email: 'bob@example.com',
    display_name: 'Bob Stone',
    role: 'member',
  },
  {
    user_id: 3,
    email: 'souza@example.com',
    display_name: 'Ana Souza',
    role: 'member',
  },
  {
    user_id: 4,
    email: 'zoe@example.com',
    display_name: 'Zoe Ângelo',
    role: 'member',
  },
  {
    user_id: 5,
    email: 'anderson@example.com',
    display_name: 'Carl Lane',
    role: 'member',
  },
]

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control'
const mod = (keys: string) => `{${MOD}>}${keys}{/${MOD}}`

let latest = ''

const Harness = ({
  initial = '',
  ...props
}: Partial<RichTextEditorProps> & { initial?: string }) => {
  const [value, setValue] = useState(initial)
  return (
    <div>
      <RichTextEditor
        label='Description'
        placeholder='Add a description…'
        value={value}
        onChange={(next) => {
          latest = next
          setValue(next)
        }}
        onSubmit={() => {}}
        members={PEOPLE}
        firstIds={[]}
        autoFocus
        {...props}
      />
      <button type='button'>After</button>
    </div>
  )
}

const editor = async (props: Parameters<typeof Harness>[0] = {}) => {
  latest = props.initial ?? ''
  const screen = await render(<Harness {...props} />)
  const field = screen.getByRole('textbox', { name: 'Description' })
  await expect.element(field).toHaveFocus()
  return { screen, field }
}

const value = () => expect.poll(() => latest)

// The picker ignores Enter for 75 ms after its list changes, so a fast typist's newline stays a newline.
const settled = () => new Promise((resolve) => setTimeout(resolve, 100))

describe('rich text editor', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('shows the placeholder and every toolbar control when empty', async () => {
    const { screen } = await editor()

    await expect.element(screen.getByText('Add a description…')).toBeVisible()
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    const names = toolbar
      .getByRole('button')
      .elements()
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual([
      'Text style',
      'Bold',
      'Italic',
      'Link',
      'Inline code',
      'Bullet list',
      'Numbered list',
      'Emoji',
      'More formatting',
      'Undo',
      'Redo',
    ])
    await expect
      .element(toolbar.getByRole('button', { name: 'Bold' }))
      .toHaveAttribute(
        'title',
        expect.stringMatching(/^Bold \((⌘B|Ctrl\+B)\)$/)
      )
  })

  it('wraps the selection in a mark with the key or the toolbar, and presses the button', async () => {
    const { screen } = await editor()

    await userEvent.keyboard('ship it')
    await userEvent.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}')
    await userEvent.keyboard(mod('b'))
    await value().toBe('ship **it**')
    const bold = screen.getByRole('button', { name: 'Bold' })
    await expect.element(bold).toHaveAttribute('aria-pressed', 'true')

    await bold.click()
    await value().toBe('ship it')
    await expect.element(bold).toHaveAttribute('aria-pressed', 'false')
    await screen.getByRole('button', { name: 'Italic' }).click()
    await value().toBe('ship _it_')
  })

  it('makes a bullet list with the key, continues it on Enter and ends it on an empty item', async () => {
    await editor()

    await userEvent.keyboard('one')
    await userEvent.keyboard(mod('{Shift>}8{/Shift}'))
    await value().toBe('- one')
    await userEvent.keyboard('{Enter}')
    await value().toBe('- one\n- ')
    await userEvent.keyboard('{Enter}')
    await value().toBe('- one\n')
  })

  it('indents with Tab inside a list and leaves the editor with Tab outside one', async () => {
    const { screen } = await editor({ initial: '- one\n- two' })

    await userEvent.keyboard(mod('{End}'))
    await userEvent.keyboard('{Tab}')
    await value().toBe('- one\n    - two')
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await value().toBe('- one\n- two')

    await userEvent.keyboard('{Enter}{Enter}plain{Tab}')
    await expect
      .element(screen.getByRole('button', { name: 'After' }))
      .toHaveFocus()
  })

  it('lists members by a word of the name or the email, the issue people first', async () => {
    const { screen } = await editor({ firstIds: [5] })

    await userEvent.keyboard('Ask @an')

    const options = screen.getByRole('option')
    await expect.element(options.first()).toHaveTextContent('Carl Lane')
    expect(options.elements().map((option) => option.textContent)).toEqual([
      expect.stringContaining('anderson@example.com'),
      expect.stringContaining('souza@example.com'),
      expect.stringContaining('zoe@example.com'),
    ])
  })

  it('inserts the mention token with Enter or Tab and shows it as one chip', async () => {
    const { screen } = await editor()

    await userEvent.keyboard('Ask @ana')
    await expect
      .element(screen.getByRole('option').first())
      .toHaveTextContent('Ana Souza')
    await settled()
    await userEvent.keyboard('{Enter}')
    await value().toBe('Ask [@Ana Souza](mention:3)')
    await expect.element(screen.getByText('@Ana Souza')).toBeVisible()

    await userEvent.keyboard(' and @bo')
    await expect
      .element(screen.getByRole('option').first())
      .toHaveTextContent('Bob Stone')
    await settled()
    await userEvent.keyboard('{Tab}')
    await value().toBe(
      'Ask [@Ana Souza](mention:3) and [@Bob Stone](mention:2)'
    )

    await userEvent.keyboard('{Backspace}')
    await value().toBe('Ask [@Ana Souza](mention:3) and ')
  })

  it('shows the current name of a mentioned member and the captured one of a former member', async () => {
    const { screen } = await editor({
      initial: 'Ask [@Bobby](mention:2) and [@Carol Ex](mention:99)',
    })

    await expect.element(screen.getByText('@Bob Stone')).toBeVisible()
    await expect
      .element(screen.getByText('@Carol Ex'))
      .toHaveClass(/text-muted-foreground/)
  })

  it('closes the picker on Esc without inserting, and cancels on the next Esc', async () => {
    const onCancel = vi.fn()
    const { screen } = await editor({ onCancel })

    await userEvent.keyboard('@an')
    await expect.element(screen.getByRole('listbox')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('listbox')).not.toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()
    await value().toBe('@an')

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('keeps one muted row open when no member matches, and an email never opens the picker', async () => {
    const { screen } = await editor()

    await userEvent.keyboard('@zz')
    const row = screen.getByRole('option', { name: 'No matching members' })
    await expect.element(row).toBeVisible()
    await settled()
    await userEvent.keyboard('{Enter}')
    await value().toBe('@zz')
    await expect.element(row).toBeVisible()

    await userEvent.keyboard('{Escape} mail a@b')
    await value().toBe('@zz mail a@b')
    expect(screen.getByRole('listbox').elements()).toHaveLength(0)
  })

  it('lists emoji after a colon and two letters, and turns :name: into the emoji', async () => {
    const { screen } = await editor()

    await userEvent.keyboard('Nice :smi')
    await expect
      .element(screen.getByRole('option', { name: /:smile:/ }))
      .toBeVisible()
    await userEvent.keyboard(
      '{Escape}{Backspace}{Backspace}{Backspace}{Backspace}'
    )
    await userEvent.keyboard(':smile: done')
    await value().toBe('Nice 😄 done')

    await screen.getByRole('button', { name: 'Emoji' }).click()
    await expect.element(screen.getByRole('listbox')).toBeVisible()
    await userEvent.keyboard('tad')
    await expect
      .element(screen.getByRole('option').first())
      .toHaveTextContent(':tada:')
    await settled()
    await userEvent.keyboard('{Enter}')
    await value().toBe('Nice 😄 done 🎉')
  })

  it('saves with Mod-Enter and keeps Enter a newline', async () => {
    const onSubmit = vi.fn()
    await editor({ onSubmit })

    await userEvent.keyboard('one{Enter}two')
    await userEvent.keyboard(mod('{Enter}'))

    expect(onSubmit).toHaveBeenCalledOnce()
    await value().toBe('one\ntwo')
  })

  it('counts down from 90% of the cap and stops input at the cap, an emoji counting once', async () => {
    const line = `${'😄'.repeat(63)}\n`
    const { screen } = await editor({
      initial: line.repeat(1023) + '😄'.repeat(MAX_RICH_TEXT - 10 - 64 * 1023),
    })

    await expect.element(screen.getByText('10 characters left')).toBeVisible()
    await userEvent.keyboard(mod('{End}'))
    await userEvent.keyboard('abcdefghijkl')
    await expect.element(screen.getByText('0 characters left')).toBeVisible()
    expect(latest.endsWith('😄abcdefghij')).toBe(true)
  })

  it('shows no counter far from the cap', async () => {
    const { screen } = await editor({ initial: 'x'.repeat(1000) })

    expect(screen.getByText(/characters left/).elements()).toHaveLength(0)
  })

  it('wraps a selection around a pasted URL and refuses a paste past the cap', async () => {
    const { screen, field } = await editor({ initial: 'see docs' })
    const paste = (text: string) => {
      const data = new DataTransfer()
      data.setData('text/plain', text)
      field.element().dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        })
      )
    }

    await userEvent.keyboard(mod('{End}'))
    await userEvent.keyboard(
      '{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}'
    )
    paste('https://example.com/docs')
    await value().toBe('see [docs](https://example.com/docs)')

    paste('x'.repeat(MAX_RICH_TEXT))
    await expect
      .element(
        screen.getByText('The paste would pass the limit of 65,536 characters.')
      )
      .toBeVisible()
    await value().toBe('see [docs](https://example.com/docs)')
  })

  it('applies text styles, blocks and history from the toolbar menus', async () => {
    const { screen } = await editor({ initial: 'Plan' })

    await screen.getByRole('button', { name: 'Text style' }).click()
    await screen.getByRole('menuitem', { name: 'Heading 2' }).click()
    await value().toBe('## Plan')
    await screen.getByRole('button', { name: 'Text style' }).click()
    await screen.getByRole('menuitem', { name: 'Normal text' }).click()
    await value().toBe('Plan')

    await screen.getByRole('button', { name: 'More formatting' }).click()
    await screen.getByRole('menuitem', { name: /Quote/ }).click()
    await value().toBe('> Plan')
    await screen.getByRole('button', { name: 'Undo' }).click()
    await value().toBe('Plan')
    await screen.getByRole('button', { name: 'Redo' }).click()
    await value().toBe('> Plan')

    await screen.getByRole('button', { name: 'More formatting' }).click()
    await screen.getByRole('menuitem', { name: /Divider/ }).click()
    await value().toBe('> Plan\n\n---\n')
    await screen.getByRole('button', { name: 'Link' }).click()
    await value().toBe('> Plan\n\n---\n[link](url)')
    await screen.getByRole('button', { name: 'Numbered list' }).click()
    await value().toBe('> Plan\n\n---\n1. [link](url)')
  })

  it('shows the name once the members arrive after the editor', async () => {
    const initial = 'Ask [@Bobby](mention:2)'
    const { screen } = await editor({ initial, members: [] })
    await expect
      .element(screen.getByText('@Bobby'))
      .toHaveClass(/text-muted-foreground/)

    await screen.rerender(<Harness initial={initial} members={PEOPLE} />)

    await expect.element(screen.getByText('@Bob Stone')).toBeVisible()
  })

  it('leaves the text alone on a formatting key while read-only', async () => {
    await editor({ initial: 'ship it', readOnly: true })

    await userEvent.keyboard(mod('a'))
    await userEvent.keyboard(mod('b'))
    await settled()

    expect(latest).toBe('ship it')
  })

  it('is read-only while saving', async () => {
    const { screen, field } = await editor({ initial: 'Plan', readOnly: true })

    await expect.element(field).toHaveAttribute('aria-readonly', 'true')
    await expect
      .element(screen.getByRole('button', { name: 'Bold' }))
      .toBeDisabled()
  })

  it('scrolls the toolbar inside itself at 375px with 44px targets', async () => {
    await page.viewport(375, 812)
    const { screen } = await editor()

    const toolbar = screen
      .getByRole('toolbar', { name: 'Formatting' })
      .element()
    expect(toolbar.scrollWidth).toBeGreaterThan(toolbar.clientWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    const bold = screen.getByRole('button', { name: 'Bold' }).element()
    expect(bold.getBoundingClientRect().height).toBe(44)
    expect(bold.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
  })
})
