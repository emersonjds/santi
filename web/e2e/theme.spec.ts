import { expect, test } from '@playwright/test'

test('a saved theme is on the page before the body is parsed', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('santi-theme', 'dark')
    new MutationObserver((_, observer) => {
      if (!document.body) return
      observer.disconnect()
      const root = document.documentElement
      root.dataset.themeAtBody = root.dataset.theme ?? 'none'
    }).observe(document, { childList: true, subtree: true })
  })

  await page.goto('/login')

  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme-at-body', 'dark')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute(
    'content',
    '#0f0f0e'
  )
})

test('System follows the device as it changes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('santi-theme', 'system'))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/login')
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'dark')

  await page.emulateMedia({ colorScheme: 'light' })

  await expect(root).toHaveAttribute('data-theme', 'light')
})
