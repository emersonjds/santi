import { afterEach, describe, expect, it } from 'vitest'
import { wireBillingToggle } from './billing-toggle'

const mount = () => {
  document.body.innerHTML = `
    <div role="group" aria-label="Billing period" data-billing hidden>
      <button type="button" aria-pressed="true" value="monthly">Monthly</button>
      <button type="button" aria-pressed="false" value="yearly">Yearly</button>
    </div>
    <p data-period="monthly">US$ 19 /month per workspace</p>
    <p data-period="yearly" hidden>US$ 190 /year per workspace</p>`
  const button = (name: string) =>
    document.querySelector(`button[value="${name}"]`) as HTMLButtonElement
  const price = (name: string) =>
    document.querySelector(`[data-period="${name}"]`) as HTMLElement
  return { button, price }
}

describe('landing billing toggle', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows the toggle once the script runs, with Monthly selected', () => {
    const { button, price } = mount()
    wireBillingToggle(document)

    expect(
      (document.querySelector('[data-billing]') as HTMLElement).hidden
    ).toBe(false)
    expect(button('monthly').getAttribute('aria-pressed')).toBe('true')
    expect(price('monthly').hidden).toBe(false)
    expect(price('yearly').hidden).toBe(true)
  })

  it('switches the Team price to yearly and back', () => {
    const { button, price } = mount()
    wireBillingToggle(document)

    button('yearly').click()
    expect(button('yearly').getAttribute('aria-pressed')).toBe('true')
    expect(button('monthly').getAttribute('aria-pressed')).toBe('false')
    expect(price('yearly').hidden).toBe(false)
    expect(price('monthly').hidden).toBe(true)

    button('monthly').click()
    expect(button('monthly').getAttribute('aria-pressed')).toBe('true')
    expect(button('yearly').getAttribute('aria-pressed')).toBe('false')
    expect(price('monthly').hidden).toBe(false)
    expect(price('yearly').hidden).toBe(true)
  })

  it('does nothing on a page without the toggle', () => {
    document.body.innerHTML = '<p>no pricing here</p>'
    expect(() => wireBillingToggle(document)).not.toThrow()
  })
})
