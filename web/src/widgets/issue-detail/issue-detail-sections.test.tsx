import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects, issue } from '@/test/stub-api'

// Its own file: the lazy sections must not have rendered yet in this module graph.
describe('issue sections', () => {
  it('turns an epic into a story in place: the view and the focus stay', async () => {
    await page.viewport(1280, 800)
    inProjects({
      'GET /api/projects/WEB/issues/1': {
        status: 200,
        body: issue({ key: 'WEB-1', summary: 'Plan', issue_type: 'epic' }),
      },
      'PATCH /api/projects/WEB/issues/1': {
        status: 200,
        body: {},
        until: new Promise(() => {}),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const type = screen.getByLabelText('Type')
    await expect.element(type).toHaveValue('epic')

    type.element().focus()
    await type.selectOptions('story')

    await expect
      .element(screen.getByRole('button', { name: 'Add subtask' }))
      .toBeVisible()
    await expect.element(type).toHaveFocus()
  })
})
