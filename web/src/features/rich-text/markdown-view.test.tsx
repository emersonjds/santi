import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { MEMBERS } from '@/test/stub-api'
import { MarkdownView } from './markdown-view'

const view = (source: string) =>
  render(<MarkdownView source={source} members={MEMBERS} />)

describe('markdown view', () => {
  it('renders bold, lists, task lists, tables and fenced code', async () => {
    const screen = await view(
      [
        'Ship **today**',
        '',
        '- one',
        '- two',
        '',
        '1. first',
        '',
        '- [x] done',
        '- [ ] open',
        '',
        '| Step | Owner |',
        '| --- | --- |',
        '| Build | Ana |',
        '',
        '```',
        'cargo test',
        '```',
      ].join('\n')
    )

    expect(screen.getByText('today').element().tagName).toBe('STRONG')
    expect(screen.getByRole('list').elements()).toHaveLength(3)
    expect(screen.getByText('first').element().closest('ol')).not.toBeNull()
    const [done, open] = screen.getByRole('checkbox').elements()
    expect(done).toBeChecked()
    expect(done).toBeDisabled()
    expect(open).not.toBeChecked()
    await expect
      .element(screen.getByRole('cell', { name: 'Ana' }))
      .toBeVisible()
    expect(
      screen.getByText('cargo test').element().closest('pre')
    ).not.toBeNull()
  })

  it('shows raw HTML as text', async () => {
    const screen = await view('<script>alert(1)</script>')

    await expect
      .element(screen.getByText('<script>alert(1)</script>'))
      .toBeVisible()
    expect(screen.container.querySelector('script')).toBeNull()
  })

  it('keeps unsafe links unclickable', async () => {
    const screen = await view('[click me](javascript:alert(1))')

    await expect.element(screen.getByText('click me')).toBeVisible()
    expect(screen.getByText('click me').element()).not.toHaveAttribute('href')
    expect(screen.getByRole('link').elements()).toHaveLength(0)
  })

  it('opens other origins in a new tab and keeps same-origin links in place', async () => {
    const screen = await view(
      '[docs](https://example.com/guide) and [board](/p/WEB/board)'
    )

    const docs = screen.getByRole('link', { name: 'docs' })
    await expect.element(docs).toHaveAttribute('target', '_blank')
    await expect.element(docs).toHaveAttribute('rel', 'noopener noreferrer')
    const board = screen.getByRole('link', { name: 'board' })
    await expect.element(board).toHaveAttribute('href', '/p/WEB/board')
    await expect.element(board).not.toHaveAttribute('target')
  })

  it('renders an image as a link to it', async () => {
    const screen = await view('![logo](https://example.com/logo.png)')

    await expect
      .element(screen.getByRole('link', { name: 'logo' }))
      .toHaveAttribute('href', 'https://example.com/logo.png')
    expect(screen.container.querySelector('img')).toBeNull()
  })

  it('renders headings one tier below the section heading', async () => {
    const screen = await view('# Goal\n\n## Scope\n\n### Notes\n\n#### Aside')

    await expect
      .element(screen.getByRole('heading', { level: 4, name: 'Goal' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('heading', { level: 5, name: 'Scope' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('heading', { level: 6, name: 'Notes' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('heading', { level: 6, name: 'Aside' }))
      .toBeVisible()
  })

  it('keeps the line breaks of old plain text', async () => {
    const screen = await view('Cover the board.\nThen the backlog.')

    const paragraph = screen.getByText('Then the backlog.').element()
    expect(paragraph.tagName).toBe('P')
    expect(paragraph.querySelector('br')).not.toBeNull()
  })

  it("shows a member's current name in a mention chip", async () => {
    const screen = await view('Ask [@Bobby](mention:2) first')

    await expect.element(screen.getByText('Bob Stone')).toBeVisible()
    expect(screen.getByText('Bobby').elements()).toHaveLength(0)
    expect(screen.getByRole('link').elements()).toHaveLength(0)
  })

  it('shows the captured name muted when the id is not a member', async () => {
    const screen = await view('Ask [@Carol Ex](mention:99) first')

    const former = screen.getByText('@Carol Ex')
    await expect.element(former).toBeVisible()
    await expect.element(former).toHaveClass('text-muted-foreground')
    expect(screen.getByRole('link').elements()).toHaveLength(0)
  })
})
