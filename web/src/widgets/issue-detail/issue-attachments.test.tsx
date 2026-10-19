import { beforeEach, describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Attachment } from '@/shared/api/client'
import { fakeXhr } from '@/test/fake-xhr'
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
      .toHaveAttribute(
        'href',
        '/api/projects/WEB/issues/1/attachments/3?download=1'
      )
    await expect
      .element(section.getByRole('link', { name: 'Download shot.png' }))
      .toHaveAttribute(
        'href',
        '/api/projects/WEB/issues/1/attachments/1?download=1'
      )
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
      .toHaveAttribute(
        'href',
        '/api/projects/WEB/issues/1/attachments/1?download=1'
      )

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

const REPORT = file({
  id: 9,
  file_name: 'report.pdf',
  content_type: 'application/pdf',
  size_bytes: 8,
  uploader_id: 1,
  uploader_name: 'Alice',
})

const filesOf = (...files: File[]) => {
  const transfer = new DataTransfer()
  for (const each of files) transfer.items.add(each)
  return transfer
}

const issueView = () => {
  const view = document.querySelector('[data-issue-view]')
  if (!view) throw new Error('no issue view')
  return view
}

const drag = (type: string, transfer: DataTransfer) =>
  issueView().dispatchEvent(
    new DragEvent(type, {
      dataTransfer: transfer,
      bubbles: true,
      cancelable: true,
    })
  )

const paste = (target: Element, transfer: DataTransfer) =>
  target.dispatchEvent(
    new ClipboardEvent('paste', {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    })
  )

const pdf = (name: string) =>
  new File(['%PDF-1.7'], name, { type: 'application/pdf' })

describe('uploading attachments', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('uploads a picked file with a progress bar, then lists it', async () => {
    let stored: Attachment[] = []
    withFiles([], { [LIST]: { status: 200, body: () => stored } })
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)
    await expect.element(section.getByText('No attachments yet.')).toBeVisible()

    const input = document.querySelector<HTMLInputElement>('input[type=file]')
    if (!input) throw new Error('no file input')
    expect(input.multiple).toBe(true)
    await userEvent.upload(input, pdf('report.pdf'))

    const row = section
      .getByRole('list', { name: 'Uploads' })
      .getByRole('listitem')
    await expect.element(row).toHaveTextContent('report.pdf')
    await expect.element(row).toHaveTextContent('8 B')
    await expect.poll(() => sent.length).toBe(1)
    const [xhr] = sent
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('/api/projects/WEB/issues/1/attachments')
    expect(xhr.withCredentials).toBe(true)
    expect(xhr.fileName).toBe('report.pdf')

    xhr.progress(4, 8)
    await expect
      .element(row.getByRole('progressbar', { name: 'Uploading report.pdf' }))
      .toHaveAttribute('value', '0.5')

    stored = [REPORT]
    xhr.respond(201, [REPORT])
    await expect.element(row).not.toBeInTheDocument()
    await expect
      .element(section.getByRole('heading', { name: 'Attachments · 1' }))
      .toBeVisible()
    await expect
      .element(section.getByRole('list', { name: 'Files' }))
      .toHaveTextContent('report.pdf')
  })

  it('cancels an upload: the request stops and the row goes', async () => {
    withFiles([])
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)
    await expect.element(section.getByText('No attachments yet.')).toBeVisible()

    drag('drop', filesOf(pdf('report.pdf')))
    const row = section.getByRole('listitem').filter({ hasText: 'report.pdf' })
    await row.getByRole('button', { name: 'Cancel' }).click()

    await expect.element(row).not.toBeInTheDocument()
    expect(sent[0].aborted).toBe(true)
  })

  it('keeps each refused file with its reason and Remove, and Retry where sending again can work', async () => {
    withFiles([])
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const section = sectionOf(screen)
    await expect.element(section.getByText('No attachments yet.')).toBeVisible()

    drag(
      'drop',
      filesOf(
        new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'big.zip'),
        new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
        new File(['x'], 'notes.txt'),
        new File(['x'], 'huge.png'),
        pdf('offline.pdf')
      )
    )
    await expect.poll(() => sent.length).toBe(3)
    const xhrOf = (name: string) => {
      const found = [...sent].reverse().find((xhr) => xhr.fileName === name)
      if (!found) throw new Error(`no upload of ${name}`)
      return found
    }
    xhrOf('notes.txt').respond(
      422,
      problem(422, 'Invalid request.', [
        { field: 'file', message: 'Text files must be UTF-8.' },
      ])
    )
    xhrOf('huge.png').respond(413, problem(413, 'The upload is too large.'))
    xhrOf('offline.pdf').fail()

    const rowOf = (name: string) =>
      section.getByRole('listitem').filter({ hasText: name })
    const reasons = {
      'big.zip': 'Larger than 25 MB.',
      'logo.svg': 'This file type is not allowed.',
      'notes.txt': 'Text files must be UTF-8.',
      'huge.png': 'The upload is too large.',
      'offline.pdf': 'Upload failed. Check your connection.',
    }
    const refusedBeforeSending = ['big.zip', 'logo.svg']
    for (const [name, reason] of Object.entries(reasons)) {
      await expect.element(rowOf(name)).toHaveTextContent(reason)
      const retry = rowOf(name).getByRole('button', { name: 'Retry' })
      if (refusedBeforeSending.includes(name))
        await expect.element(retry).not.toBeInTheDocument()
      else await expect.element(retry).toBeVisible()
      await expect
        .element(rowOf(name).getByRole('button', { name: 'Remove' }))
        .toBeVisible()
    }

    await rowOf('big.zip').getByRole('button', { name: 'Remove' }).click()
    await expect.element(rowOf('big.zip')).not.toBeInTheDocument()
    expect(sent).toHaveLength(3)

    await rowOf('offline.pdf').getByRole('button', { name: 'Retry' }).click()
    await expect.poll(() => sent.length).toBe(4)
    await expect
      .element(rowOf('offline.pdf').getByRole('progressbar'))
      .toBeVisible()
    xhrOf('offline.pdf').respond(201, [REPORT])
    await expect.element(rowOf('offline.pdf')).not.toBeInTheDocument()
  })

  it('shows the drop overlay while files are dragged over the issue, and uploads what lands', async () => {
    withFiles([])
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    await expect.element(screen.getByLabelText('Summary')).toBeVisible()
    const overlay = screen.getByText('Drop files to attach')

    drag('dragenter', filesOf(pdf('report.pdf')))
    await expect.element(overlay).toBeVisible()
    drag('dragleave', filesOf(pdf('report.pdf')))
    await expect.element(overlay).not.toBeInTheDocument()

    drag('dragenter', filesOf(pdf('report.pdf')))
    drag('dragover', filesOf(pdf('report.pdf')))
    drag('drop', filesOf(pdf('report.pdf')))
    await expect.element(overlay).not.toBeInTheDocument()
    await expect
      .poll(() => sent.map((xhr) => xhr.fileName))
      .toEqual(['report.pdf'])

    drag('dragenter', new DataTransfer())
    await expect.element(overlay).not.toBeInTheDocument()
  })

  it('uploads an image pasted outside an editor, and leaves a paste in a field alone', async () => {
    withFiles([])
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const image = new File(['png'], 'image.png', { type: 'image/png' })

    const copy = screen.getByRole('button', { name: 'Copy link' })
    await expect.element(copy).toBeVisible()
    paste(copy.element(), filesOf(image))
    await expect
      .poll(() => sent.map((xhr) => xhr.fileName))
      .toEqual(['image.png'])

    paste(screen.getByLabelText('Summary').element(), filesOf(image))
    paste(copy.element(), filesOf(pdf('report.pdf')))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(sent).toHaveLength(1)
  })

  it('takes no drop or paste in an archived project', async () => {
    withFiles([], {
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived' },
      },
    })
    const sent = fakeXhr()
    const { screen } = await renderApp('/p/WEB/issues/1')
    const copy = screen.getByRole('button', { name: 'Copy link' })
    await expect
      .element(screen.getByText('This project is archived and read-only.'))
      .toBeVisible()

    drag('dragenter', filesOf(pdf('report.pdf')))
    drag('drop', filesOf(pdf('report.pdf')))
    paste(
      copy.element(),
      filesOf(new File(['png'], 'image.png', { type: 'image/png' }))
    )
    await new Promise((resolve) => setTimeout(resolve, 100))

    await expect
      .element(screen.getByText('Drop files to attach'))
      .not.toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })
})
