import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { ALICE, signedIn } from '@/test/stub-api'

// A chunk that fails to load reaches the boundary the same way: thrown while rendering.
vi.mock('./welcome-tour', () => ({
  WelcomeTour: () => {
    throw new Error('chunk failed to load')
  },
}))

describe('tour host', () => {
  it('keeps the app when the tour fails to load', async () => {
    signedIn({
      'GET /api/me': { status: 200, body: { ...ALICE, tour_seen_at: null } },
    })
    const { screen } = await renderApp('/')

    await expect
      .element(screen.getByRole('heading', { name: 'No projects yet' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Account' }))
      .toBeEnabled()
    expect(screen.getByRole('dialog').elements()).toHaveLength(0)
  })
})
