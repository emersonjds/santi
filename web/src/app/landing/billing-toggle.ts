/** Landing pricing: the `[data-billing]` buttons pick which `[data-period]` price shows; without the script only the monthly one does. */
export const wireBillingToggle = (root: ParentNode) => {
  const group = root.querySelector<HTMLElement>('[data-billing]')
  if (!group) return
  const buttons = group.querySelectorAll('button')
  const prices = root.querySelectorAll<HTMLElement>('[data-period]')
  for (const button of buttons) {
    button.addEventListener('click', () => {
      for (const other of buttons)
        other.setAttribute('aria-pressed', String(other === button))
      for (const price of prices)
        price.hidden = price.dataset.period !== button.value
    })
  }
  group.hidden = false
}
