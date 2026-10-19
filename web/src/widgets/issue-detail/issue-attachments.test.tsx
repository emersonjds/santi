import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Attachment } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import { WEB, inProjects, problem, routeOf } from '@/test/stub-api'

const LIST = 'GET /api/projects/WEB/issues/1/attachments'
const NOTE = 'archived-note'
const ago = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString()

const file = (
  fields: Partial<Attachment> & Pick<Attachment, 'id' | 'file_name'>
): Attachment => ({
  content_type: 'image/png',
  size_bytes: 2048,
  uploader_id: 2,
  uploader_name: 'Bob Stone',
  comment_id: null,
  created_at: ago(2),
  ...fields,
})

const SHOT = file({ id: 1, file_name: 'shot.png' })
const DIAGRAM = file({
  id: 2,
  file_name: 'diagram.webp',
  content_type: 'image/webp',
  uploader_id: 1,
  uploader_name: 'Alice',
})
const SPEC = file({
  id: 3,
  file_name: 'spec.pdf',
  content_type: 'application/pdf',
  size_bytes: 2_516_582,
})
const NOTES = file({
  id: 4,
  file_name: 'notes.txt',
  content_type: 'text/plain; charset=utf-8',
  size_bytes: 1200,
  uploader_id: 1,
  uploader_name: 'Alice',
  comment_id: 1,
  created_at: ago(26),
})
const ALL = [SHOT, DIAGRAM, SPEC, NOTES]

const sectionOf = (screen: RenderResult) =>
  screen.getByRole('region', { name: /^Attachments/ })

const withFiles = (files: Attachment[], replies = {}) =>
  inProjects({ [LIST]: { status: 200, body: files }, ...replies })

/** Answers the first list only: the refetch after a write stays pending, so the list shows what the client did. */
const heldFiles = (files: Attachment[], replies = {}) => {
  let calls = 0
  return withFiles(files, {
    [LIST]: {
      status: 200,
      body: files,
      until: () => (calls++ === 0 ? undefined : new Promise(() => {})),
    },
    ...replies,
  })
}

describe('issue attachments', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('says there are no attachments yet next to the Attach button', async () => {
    withFiles([])
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)

    await expect.element(section.getByText('No attachments yet.')).toBeVisible()
    await expect
      .element(section.getByRole('heading', { name: 'Attachments' }))
      .toBeVisible()
    await expect
      .element(section.getByRole('button', { name: 'Attach files' }))
      .toBeVisible()
  })

  it('lists images as tiles and other files as rows, counted in the title', async () => {
    withFiles(ALL)
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)

    await expect
      .element(section.getByRole('heading', { name: 'Attachments · 4' }))
      .toBeVisible()
    const tiles = section.getByRole('list', { name: 'Images' })
    await expect
      .element(tiles.getByRole('img', { name: 'shot.png' }))
      .toHaveAttribute('src', '/api/projects/WEB/issues/1/attachments/1')
    await expect
      .element(tiles.getByRole('img', { name: 'shot.png' }))
      .toHaveAttribute('loading', 'lazy')
    await expect
      .element(tiles.getByRole('img', { name: 'diagram.webp' }))
      .toBeInTheDocument()

    const rows = section
      .getByRole('list', { name: 'Files' })
      .getByRole('listitem')
    expect(rows.elements()).toHaveLength(2)
    await expect.element(rows.nth(0)).toHaveTextContent('spec.pdf')
    await expect.element(rows.nth(0)).toHaveTextContent('2.4 MB')
    await expect.element(rows.nth(0)).toHaveTextContent('Bob Stone')
    await expect.element(rows.nth(0)).toHaveTextContent('2 hours ago')
    await expect.element(rows.nth(0)).not.toHaveTextContent('in a comment')
    await expect.element(rows.nth(1)).toHaveTextContent('1.2 KB')
    await expect.element(rows.nth(1)).toHaveTextContent('yesterday')
    await expect.element(rows.nth(1)).toHaveTextContent('in a comment')
    await expect
      .element(section.getByRole('link', { name: 'Download spec.pdf' }))
      .toHaveAttribute('href', '/api/projects/WEB/issues/1/attachments/3')
  })

  it('says so with a Retry when the list fails', async () => {
    const requests = inProjects({
      [LIST]: { status: 500, body: problem(500, 'Down.') },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)
    const lists = () =>
      requests.filter((request) => routeOf(request) === LIST).length

    await expect
      .element(section.getByText("Couldn't load the attachments."))
      .toBeVisible()
    const before = lists()
    await section.getByRole('button', { name: 'Retry' }).click()
    await expect.poll(lists).toBe(before + 1)
  })

  it('opens an image in a viewer that steps with arrows, buttons and swipes; Esc closes only it', async () => {
    withFiles(ALL)
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)

    await section.getByRole('button', { name: 'shot.png', exact: true }).click()
    const viewer = screen.getByRole('dialog', { name: 'shot.png' })
    await expect
      .element(viewer.getByRole('img', { name: 'shot.png' }))
      .toBeVisible()
    await expect
      .element(viewer.getByRole('link', { name: 'Download' }))
      .toHaveAttribute('href', '/api/projects/WEB/issues/1/attachments/1')

    await userEvent.keyboard('{ArrowRight}')
    await expect
      .element(screen.getByRole('dialog', { name: 'diagram.webp' }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Next image' }).click()
    await expect
      .element(screen.getByRole('dialog', { name: 'shot.png' }))
      .toBeVisible()
    await userEvent.keyboard('{ArrowLeft}')
    await expect
      .element(screen.getByRole('dialog', { name: 'diagram.webp' }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Previous image' }).click()

    const image = screen
      .getByRole('dialog', { name: 'shot.png' })
      .getByRole('img')
      .element()
    image.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 300, bubbles: true })
    )
    image.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 100, bubbles: true })
    )
    await expect
      .element(screen.getByRole('dialog', { name: 'diagram.webp' }))
      .toBeVisible()

    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    await expect
      .element(section.getByRole('button', { name: 'shot.png', exact: true }))
      .toHaveFocus()
    await expect.element(screen.getByLabelText('Summary')).toBeVisible()
  })

  it('deletes a file after the confirm, and the count follows', async () => {
    const requests = heldFiles(ALL, {
      'DELETE /api/projects/WEB/issues/1/attachments/3': { status: 204 },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)
    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete spec.pdf?',
    })

    await section.getByRole('button', { name: 'Delete spec.pdf' }).click()
    await expect.element(confirm).toHaveTextContent('This cannot be undone.')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(confirm).not.toBeInTheDocument()
    expect(requests.map(routeOf)).not.toContain(
      'DELETE /api/projects/WEB/issues/1/attachments/3'
    )

    await section.getByRole('button', { name: 'Delete spec.pdf' }).click()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect.element(section.getByText('spec.pdf')).not.toBeInTheDocument()
    await expect
      .element(section.getByRole('heading', { name: 'Attachments · 3' }))
      .toBeVisible()
    expect(requests.map(routeOf)).toContain(
      'DELETE /api/projects/WEB/issues/1/attachments/3'
    )
  })

  it('puts a file back when the server refuses the delete', async () => {
    heldFiles(ALL, {
      'DELETE /api/projects/WEB/issues/1/attachments/3': {
        status: 500,
        body: problem(500, 'The database is away.'),
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)

    await section.getByRole('button', { name: 'Delete spec.pdf' }).click()
    await screen
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete' })
      .click()

    await expect
      .element(screen.getByText("Couldn't delete the file"))
      .toBeVisible()
    await expect.element(section.getByText('spec.pdf')).toBeVisible()
  })

  it('offers a member Delete only on the files they uploaded', async () => {
    withFiles(ALL, {
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, role: 'member' },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)

    await expect
      .element(section.getByRole('button', { name: 'Delete notes.txt' }))
      .toBeInTheDocument()
    await expect
      .element(section.getByRole('button', { name: 'Delete diagram.webp' }))
      .toBeInTheDocument()
    await expect
      .element(section.getByRole('button', { name: 'Delete spec.pdf' }))
      .not.toBeInTheDocument()
    await expect
      .element(section.getByRole('button', { name: 'Delete shot.png' }))
      .not.toBeInTheDocument()
    await expect
      .element(section.getByRole('link', { name: 'Download spec.pdf' }))
      .toBeInTheDocument()
  })

  it('locks Attach and Delete in an archived project and keeps Download', async () => {
    withFiles(ALL, {
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived' },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)

    for (const name of ['Attach files', 'Delete spec.pdf']) {
      const control = section.getByRole('button', { name })
      await expect.element(control).toHaveAttribute('aria-disabled', 'true')
      await expect.element(control).toHaveAttribute('aria-describedby', NOTE)
    }
    await section
      .getByRole('button', { name: 'Delete spec.pdf' })
      .click({ force: true })
    await new Promise((resolve) => setTimeout(resolve, 100))
    await expect
      .element(screen.getByRole('alertdialog'))
      .not.toBeInTheDocument()
    await expect
      .element(section.getByRole('link', { name: 'Download spec.pdf' }))
      .not.toHaveAttribute('aria-disabled')
  })

  it('shows tiles two per row at 375 with 44px controls and no sideways scroll', async () => {
    await page.viewport(375, 800)
    withFiles(ALL)
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)
    const tiles = section.getByRole('list', { name: 'Images' })
    await expect.element(tiles).toBeVisible()

    const [first, second] = tiles
      .getByRole('listitem')
      .elements()
      .map((tile) => tile.getBoundingClientRect())
    expect(first.top).toBe(second.top)
    expect(first.width).toBeGreaterThan(140)

    const controls = [
      section.getByRole('button', { name: 'Attach files' }).element(),
      section.getByRole('link', { name: 'Download spec.pdf' }).element(),
      section.getByRole('button', { name: 'Delete spec.pdf' }).element(),
      section.getByRole('link', { name: 'Download shot.png' }).element(),
    ]
    for (const control of controls) {
      const box = control.getBoundingClientRect()
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    )
  })
})
