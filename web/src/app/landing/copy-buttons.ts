/** Landing page: every `button[data-copy]` copies its command; the label reports the outcome. */
export const wireCopyButtons = (root: ParentNode) => {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    'button[data-copy]'
  )) {
    const label = button.textContent
    button.addEventListener('click', () => {
      navigator.clipboard.writeText(button.dataset.copy ?? '').then(
        () => {
          button.textContent = 'Copied'
          setTimeout(() => (button.textContent = label), 2000)
        },
        () => (button.textContent = 'Select and copy')
      )
    })
  }
}
