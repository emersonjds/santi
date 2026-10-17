import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { Toaster } from '@/shared/ui/sonner'
import { toast } from './toast'

describe('toast', () => {
  it('shows a toast sent before the Toaster mounted', async () => {
    toast.success('Archived WEB')
    await new Promise((resolve) => setTimeout(resolve, 100))

    const screen = await render(<Toaster />)

    await expect.element(screen.getByText('Archived WEB')).toBeVisible()
  })
})
