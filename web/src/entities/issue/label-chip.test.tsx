import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { LabelChip } from './label-chip'
import { LABEL_TONES, labelTone } from './label-tone'

const HUES = [
  'red',
  'orange',
  'amber',
  'lime',
  'sky',
  'blue',
  'fuchsia',
  'pink',
]

describe('label colour', () => {
  it('gives a name the same tone every time, in any case', () => {
    expect(labelTone('Frontend')).toBe(labelTone('frontend'))
    expect(labelTone('ux')).toBe(labelTone('ux'))
  })

  it('draws from the eight label hues only', () => {
    expect(LABEL_TONES).toEqual(
      HUES.map((hue) => `bg-label-${hue}-bg text-label-${hue}`)
    )
    for (const name of ['', 'ci', 'good-first-issue', 'A'.repeat(50)])
      expect(LABEL_TONES).toContain(labelTone(name))
  })

  it('spreads many names evenly over the hues', () => {
    const counts = new Map<string, number>()
    for (let at = 0; at < 8000; at++) {
      const tone = labelTone(`label-${at}`)
      counts.set(tone, (counts.get(tone) ?? 0) + 1)
    }
    expect(counts.size).toBe(8)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThanOrEqual(900)
      expect(count).toBeLessThanOrEqual(1100)
    }
  })

  it('keeps the hue order, so no label changes colour', () => {
    expect(['frontend', 'backend', 'tech-debt'].map(labelTone)).toEqual([
      'bg-label-fuchsia-bg text-label-fuchsia',
      'bg-label-amber-bg text-label-amber',
      'bg-label-sky-bg text-label-sky',
    ])
  })
})

describe('label chip', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('reads at default size with a wide name, the full text on hover', async () => {
    const screen = await render(<LabelChip name='backend' />)

    const name = screen.getByTitle('backend')
    await expect.element(name).toHaveTextContent('backend')
    await expect.element(name).toHaveClass('truncate', 'max-w-48')
    expect(name.element().parentElement).toHaveClass(
      'text-sm',
      'px-2',
      'rounded-md',
      'font-medium',
      'bg-label-amber-bg',
      'text-label-amber'
    )
  })

  it('shrinks to compact with a narrow name and merges a class', async () => {
    const screen = await render(
      <LabelChip size='compact' name='ux' className='pe-0' />
    )

    const name = screen.getByTitle('ux')
    await expect.element(name).toHaveClass('max-w-20')
    expect(name.element().parentElement).toHaveClass(
      'text-xs',
      'px-1.5',
      'rounded-sm',
      'pe-0'
    )
  })

  it('puts its children after the name', async () => {
    const screen = await render(
      <LabelChip name='ui'>
        <button type='button'>Remove label ui</button>
      </LabelChip>
    )

    const chip = screen.getByTitle('ui').element().parentElement
    expect(chip?.lastElementChild).toBe(
      screen.getByRole('button', { name: 'Remove label ui' }).element()
    )
  })

  it('takes its colours from the label tokens in light and dark', async () => {
    const screen = await render(<LabelChip name='docs' />)
    const chip = screen.getByTitle('docs').element().parentElement
    if (!chip) throw new Error('no chip')

    expect(getComputedStyle(chip).backgroundColor).toBe('rgb(254, 243, 199)')
    expect(getComputedStyle(chip).color).toBe('rgb(146, 64, 14)')
    document.documentElement.dataset.theme = 'dark'
    expect(getComputedStyle(chip).backgroundColor).toBe('rgb(58, 42, 10)')
    expect(getComputedStyle(chip).color).toBe('rgb(251, 191, 36)')
  })
})
