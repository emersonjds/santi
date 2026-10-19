import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Attachment, Comment } from '@/shared/api/client'
import { fakeXhr } from '@/test/fake-xhr'
import { renderApp } from '@/test/render-app'
import {
  WEB,
  WEB_COMMENTS,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const LIST = 'GET /api/projects/WEB/issues/1/attachments'
const COMMENTS = 'GET /api/projects/WEB/issues/1/comments'
const POST = 'POST /api/projects/WEB/issues/1/comments'

const SAVED: Comment = {
  id: 7,
  author_id: 1,
  author_name: 'Alice',
  body: 'See files.',
  created_at: new Date().toISOString(),
}

const attachment = (
  fields: Partial<Attachment> & Pick<Attachment, 'id' | 'file_name'>
): Attachment => ({
  content_type: 'application/pdf',
  size_bytes: 8,
  uploader_id: 1,
  uploader_name: 'Alice',
  comment_id: null,
  created_at: new Date().toISOString(),
  ...fields,
})

const pdf = (name: string) =>
  new File(['%PDF-1.7'], name, { type: 'application/pdf' })
const png = (name: string) => new File(['png'], name, { type: 'image/png' })

const filesOf = (...files: File[]) => {
  const transfer = new DataTransfer()
  for (const each of files) transfer.items.add(each)
  return transfer
}

const commentsOf = (screen: RenderResult) =>
  screen.getByRole('region', { name: 'Comments' })

const commentWith = (screen: RenderResult, text: string) =>
  commentsOf(screen).getByRole('listitem').filter({ hasText: text })

const composerZone = (screen: RenderResult) => {
  const zone = commentsOf(screen)
    .element()
    .querySelector('form')
    ?.closest('[data-drop-zone]')
  if (!zone) throw new Error('no composer drop zone')
  return zone
}

const pick = async (screen: RenderResult, ...files: File[]) => {
  const input =
    composerZone(screen).querySelector<HTMLInputElement>('input[type=file]')
  if (!input) throw new Error('no composer file input')
  await userEvent.upload(input, files)
}

/** The thread lists the saved comment once it was posted, as the server would. */
const thread = (replies = {}) => {
  let posted = false
  return inProjects({
    [COMMENTS]: {
      status: 200,
      body: () => ({
        items: posted ? [...WEB_COMMENTS, SAVED] : WEB_COMMENTS,
        next_cursor: null,
      }),
    },
    [POST]: {
      status: 201,
      body: () => {
        posted = true
        return SAVED
      },
    },
    ...replies,
  })
}

const write = async (screen: RenderResult, text: string) => {
  await commentsOf(screen)
    .getByRole('button', { name: 'Add a comment…' })
    .click()
  await expect
    .element(screen.getByRole('toolbar', { name: 'Formatting' }))
    .toBeVisible()
  await userEvent.keyboard(text)
}

describe('files on comments', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('holds picked, dropped and pasted files as chips, then uploads them to the comment once it is posted', async () => {
    let stored: Attachment[] = []
    const requests = thread({
      [LIST]: { status: 200, body: () => stored },
    })
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    await write(screen, 'See files.')

    await pick(screen, pdf('report.pdf'))
    composerZone(screen).dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: filesOf(new File(['<svg/>'], 'logo.svg')),
        bubbles: true,
        cancelable: true,
      })
    )
    screen
      .getByRole('textbox', { name: 'Add a comment' })
      .element()
      .dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: filesOf(png('image.png')),
          bubbles: true,
          cancelable: true,
        })
      )

    const chips = commentsOf(screen).getByRole('list', {
      name: 'Files to attach',
    })
    await expect
      .poll(() => chips.getByRole('listitem').elements().length)
      .toBe(3)
    await expect.element(chips).toHaveTextContent('report.pdf')
    await expect.element(chips).toHaveTextContent('8 B')
    await expect
      .element(chips.getByRole('listitem').filter({ hasText: 'logo.svg' }))
      .toHaveTextContent('This file type is not allowed.')
    await chips.getByRole('button', { name: 'Remove logo.svg' }).click()
    expect(chips.getByRole('listitem').elements()).toHaveLength(2)
    expect(sent).toHaveLength(0)
    await expect
      .element(screen.getByText('Drop files to attach'))
      .not.toBeInTheDocument()

    await commentsOf(screen).getByRole('button', { name: 'Save' }).click()

    await expect
      .poll(() => sent.map((xhr) => xhr.fileName))
      .toEqual(['report.pdf', 'image.png'])
    expect(requests.map(routeOf)).toContain(POST)
    for (const xhr of sent) {
      expect(xhr.url).toBe('/api/projects/WEB/issues/1/attachments')
      expect(xhr.body instanceof FormData && xhr.body.get('comment_id')).toBe(
        '7'
      )
    }
    await expect.element(chips).not.toBeInTheDocument()
    const comment = commentWith(screen, 'See files.')
    await expect
      .element(
        comment.getByRole('progressbar', { name: 'Uploading report.pdf' })
      )
      .toBeVisible()

    stored = [
      attachment({ id: 11, file_name: 'report.pdf', comment_id: 7 }),
      attachment({
        id: 12,
        file_name: 'image.png',
        content_type: 'image/png',
        comment_id: 7,
      }),
    ]
    sent[0].respond(201, [stored[0]])
    sent[1].respond(201, [stored[1]])

    await expect
      .element(comment.getByRole('list', { name: 'Files' }))
      .toHaveTextContent('report.pdf')
    await expect
      .element(comment.getByRole('img', { name: 'image.png' }))
      .toBeVisible()
    await expect
      .element(comment.getByRole('progressbar'))
      .not.toBeInTheDocument()
    await expect
      .element(comment.getByRole('link', { name: 'Download report.pdf' }))
      .toHaveAttribute(
        'href',
        '/api/projects/WEB/issues/1/attachments/11?download=1'
      )
  })

  it('shows a failed upload under its comment with Retry', async () => {
    thread()
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    await write(screen, 'See files.')
    await pick(screen, pdf('report.pdf'))
    await commentsOf(screen).getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => sent.length).toBe(1)
    sent[0].fail()
    const comment = commentWith(screen, 'See files.')
    await expect
      .element(comment)
      .toHaveTextContent('Upload failed. Check your connection.')
    await comment.getByRole('button', { name: 'Retry report.pdf' }).click()

    await expect.poll(() => sent.length).toBe(2)
    expect(
      sent[1].body instanceof FormData && sent[1].body.get('comment_id')
    ).toBe('7')
  })

  it('gives the text and the files back when the comment is refused', async () => {
    thread({ [POST]: { status: 500, body: problem(500, 'Down.') } })
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    await write(screen, 'See files.')
    await pick(screen, pdf('report.pdf'))
    await commentsOf(screen).getByRole('button', { name: 'Save' }).click()

    await expect
      .element(screen.getByText("Couldn't add the comment"))
      .toBeVisible()
    await expect
      .element(
        commentsOf(screen).getByRole('list', { name: 'Files to attach' })
      )
      .toHaveTextContent('report.pdf')
    expect(sent).toHaveLength(0)
  })

  it('lists files under their comment, with Delete only for their uploader or an admin', async () => {
    const notes = attachment({
      id: 4,
      file_name: 'notes.txt',
      content_type: 'text/plain',
      uploader_id: 2,
      uploader_name: 'Bob Stone',
      comment_id: 1,
    })
    const spec = attachment({ id: 3, file_name: 'spec.pdf' })
    inProjects({
      [LIST]: { status: 200, body: [spec, notes] },
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, role: 'member' },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comment = commentWith(screen, 'Draft is in the shared doc.')

    await expect
      .element(comment.getByRole('link', { name: 'Download notes.txt' }))
      .toBeVisible()
    await expect.element(comment).not.toHaveTextContent('spec.pdf')
    await expect
      .element(comment.getByRole('button', { name: 'Delete notes.txt' }))
      .not.toBeInTheDocument()
  })

  it('deletes a comment file after the confirm when the user is an admin', async () => {
    const notes = attachment({
      id: 4,
      file_name: 'notes.txt',
      uploader_id: 2,
      comment_id: 1,
    })
    let deleted = false
    const requests = inProjects({
      [LIST]: { status: 200, body: () => (deleted ? [] : [notes]) },
      'DELETE /api/projects/WEB/issues/1/attachments/4': {
        status: 204,
        body: () => {
          deleted = true
          return undefined
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const comment = commentWith(screen, 'Draft is in the shared doc.')

    await comment.getByRole('button', { name: 'Delete notes.txt' }).click()
    await screen
      .getByRole('alertdialog', { name: 'Delete notes.txt?' })
      .getByRole('button', { name: 'Delete' })
      .click()

    await expect.element(comment).not.toHaveTextContent('notes.txt')
    expect(requests.map(routeOf)).toContain(
      'DELETE /api/projects/WEB/issues/1/attachments/4'
    )
  })

  it('drops the files of a deleted comment from the Attachments section', async () => {
    let deleted = false
    const notes = attachment({ id: 4, file_name: 'notes.txt', comment_id: 1 })
    inProjects({
      [LIST]: { status: 200, body: () => (deleted ? [] : [notes]) },
      'DELETE /api/projects/WEB/issues/1/comments/1': {
        status: 204,
        body: () => {
          deleted = true
          return undefined
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = screen.getByRole('region', { name: /^Attachments/ })
    await expect.element(section).toHaveTextContent('notes.txt')

    await commentsOf(screen)
      .getByRole('button', { name: 'Comment actions' })
      .click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await screen
      .getByRole('alertdialog', { name: 'Delete this comment?' })
      .getByRole('button', { name: 'Delete' })
      .click()

    await expect.element(section).not.toHaveTextContent('notes.txt')
  })

  it('keeps the attach button at 44px at 375', async () => {
    await page.viewport(375, 800)
    thread()
    const { screen } = await renderApp('/p/WEB/issues/1')
    await write(screen, 'x')

    const box = commentsOf(screen)
      .getByRole('button', { name: 'Attach files to the comment' })
      .element()
      .getBoundingClientRect()
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    )
  })
})
