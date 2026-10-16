import { describe, expect, it } from 'vitest'
import type { RenderResult } from 'vitest-browser-react'
import type { ImportMapping, ImportPreview } from '@/shared/api/client'
import { renderApp } from '@/test/render-app'
import {
  OPS,
  OPS_BOARD,
  WEB_BACKLOG,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const PREVIEW = '/api/projects/WEB/imports/preview'
const IMPORT = '/api/projects/WEB/imports'
const OPS_ADMIN = { ...OPS, role: 'admin' }

const JIRA: ImportPreview = {
  source: 'jira',
  row_count: 5,
  columns: [],
  statuses: [
    { name: 'To Do', count: 2, category: 'todo', suggested_status_id: 10 },
    {
      name: 'In Review',
      count: 1,
      category: 'in_progress',
      suggested_status_id: 21,
    },
    { name: 'Shipped', count: 2, category: 'done', suggested_status_id: 30 },
  ],
  people: [
    { name: 'bob@example.com', count: 3, member_id: 2 },
    { name: 'Carol Smith', count: 1, member_id: null },
  ],
  sprints: [
    { name: 'Sprint 1', count: 2, closed: true },
    { name: 'Sprint 2', count: 1, closed: false },
  ],
  issue_types: [
    { name: 'Epic', count: 1, suggested: 'epic' },
    { name: 'Story', count: 2, suggested: 'story' },
    { name: 'Sub-task', count: 1, suggested: 'subtask' },
    { name: 'Spike', count: 1, suggested: 'story' },
  ],
  problems: [{ line: 6, message: 'the summary is empty' }],
}

const DEFAULT_MAPPING: ImportMapping = {
  statuses: { 'To Do': 10, 'In Review': 21, Shipped: 30 },
  people: { 'bob@example.com': 2, 'Carol Smith': null },
  sprints: { 'Sprint 1': 'closed', 'Sprint 2': 'future' },
  types: {
    Epic: 'epic',
    Story: 'story',
    'Sub-task': 'subtask',
    Spike: 'story',
  },
}

const csv = (name = 'export.csv', bytes = 'Summary,Issue key\n') =>
  new File([bytes], name, { type: 'text/csv' })

const upload = (screen: RenderResult, file = csv()) =>
  screen.getByLabelText('Choose a CSV file').upload(file)

const sent = (requests: Request[], route: string) =>
  requests.filter((request) => routeOf(request) === `POST ${route}`)

const mappingOf = async (request: Request) => {
  const form = await request.clone().formData()
  const file = form.get('file')
  return {
    file: file instanceof File ? file.name : file,
    mapping: JSON.parse(String(form.get('mapping'))),
  }
}

const held = () => {
  let release = () => {}
  const until = new Promise<void>((resolve) => (release = resolve))
  return { until, release: () => release() }
}

const reviewing = async (path = '/p/WEB/settings/import') => {
  const { screen, router } = await renderApp(path)
  await upload(screen)
  await expect
    .element(screen.getByRole('heading', { name: 'Review the mapping' }))
    .toBeVisible()
  return { screen, router }
}

describe('import page', () => {
  it('answers 403 to a member', async () => {
    inProjects()
    const { screen } = await renderApp('/p/OPS/settings/import')

    await expect
      .element(screen.getByText('Only project admins can change settings.'))
      .toBeVisible()
  })

  it('opens from the board settings with help for each export', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/settings')

    await screen.getByRole('link', { name: 'Import issues' }).click()

    await expect
      .element(screen.getByRole('heading', { name: 'Upload an export' }))
      .toBeVisible()
    expect(router.state.location.pathname).toBe('/p/WEB/settings/import')
    await screen.getByText('From Linear').click()
    await expect
      .element(screen.getByRole('link', { name: /Linear's export guide/ }))
      .toHaveAttribute('href', 'https://linear.app/docs/exporting-data')
  })

  it('checks the file before sending it: CSV only, 10 MB at most', async () => {
    const requests = inProjects()
    const { screen } = await renderApp('/p/WEB/settings/import')

    await upload(screen, new File(['hi'], 'notes.txt', { type: 'text/plain' }))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Pick a .csv file')

    await upload(screen, csv('big.csv', 'x'.repeat(10 * 1024 * 1024 + 1)))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('over 10 MB')
    expect(sent(requests, PREVIEW)).toHaveLength(0)
  })

  it('takes a dropped file and shows why the server refused it', async () => {
    const requests = inProjects({
      [`POST ${PREVIEW}`]: {
        status: 422,
        body: problem(422, 'Validation failed', [
          { field: 'file', message: 'not a recognized export' },
        ]),
      },
    })
    const { screen } = await renderApp('/p/WEB/settings/import')
    const zone = screen.getByRole('region', { name: 'Drop a CSV export here' })
    await expect.element(zone).toBeVisible()

    const data = new DataTransfer()
    data.items.add(csv('dropped.csv'))
    zone.element().dispatchEvent(new DragEvent('dragover', { bubbles: true }))
    zone
      .element()
      .dispatchEvent(
        new DragEvent('drop', { bubbles: true, dataTransfer: data })
      )

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('not a recognized export')
    const form = await sent(requests, PREVIEW)[0].clone().formData()
    expect(form.get('file')).toBeInstanceOf(File)
  })

  it('prefills the mapping from the preview and counts what will be created', async () => {
    inProjects({ [`POST ${PREVIEW}`]: { status: 200, body: JIRA } })
    const { screen } = await reviewing()

    await expect.element(screen.getByText('Jira export, 5 rows.')).toBeVisible()
    const select = (name: string) => screen.getByRole('combobox', { name })
    await expect.element(select('Status for In Review')).toHaveValue('21')
    await expect.element(select('Member for bob@example.com')).toHaveValue('2')
    await expect.element(select('Member for Carol Smith')).toHaveValue('')
    await expect.element(select('Sprint 1')).toHaveValue('closed')
    await expect.element(select('Sprint 2')).toHaveValue('future')
    await expect.element(select('Type for Spike')).toHaveValue('story')
    await expect
      .element(screen.getByText(/^3 issues, 1 epic and 1 subtask/))
      .toBeVisible()

    await select('Type for Spike').selectOptions('epic')
    await expect
      .element(screen.getByText(/^2 issues, 2 epics and 1 subtask/))
      .toBeVisible()

    await screen.getByText('1 row with a problem').click()
    await expect
      .element(screen.getByText('Line 6: the summary is empty'))
      .toBeVisible()
  })

  it('sends the file and the mapping, then tells what happened', async () => {
    const reply = held()
    const requests = inProjects({
      [`POST ${PREVIEW}`]: { status: 200, body: JIRA },
      [`POST ${IMPORT}`]: {
        status: 200,
        until: reply.until,
        body: {
          source: 'jira',
          created: 4,
          skipped: 0,
          failed: 1,
          problems: [{ line: 6, message: 'the summary is empty' }],
        },
      },
    })
    const { screen } = await reviewing()

    await screen
      .getByRole('combobox', { name: 'Member for Carol Smith' })
      .selectOptions('1')
    await screen.getByRole('button', { name: 'Import' }).click()
    await expect
      .element(screen.getByRole('button', { name: 'Importing…' }))
      .toBeDisabled()
    reply.release()

    await expect
      .element(screen.getByRole('heading', { name: 'Import finished' }))
      .toBeVisible()
    expect(await mappingOf(sent(requests, IMPORT)[0])).toEqual({
      file: 'export.csv',
      mapping: {
        ...DEFAULT_MAPPING,
        people: { 'bob@example.com': 2, 'Carol Smith': 1 },
      },
    })
    const counts = screen.getByRole('list', { name: 'Import counts' })
    await expect.element(counts).toHaveTextContent('Created4')
    await expect.element(counts).toHaveTextContent('Skipped0')
    await expect.element(counts).toHaveTextContent('Failed1')
    await expect
      .element(screen.getByText('Line 6: the summary is empty'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('link', { name: 'Open board' }))
      .toHaveAttribute('href', '/p/WEB/board')
    await expect
      .element(screen.getByRole('link', { name: 'Open backlog' }))
      .toHaveAttribute('href', '/p/WEB/backlog')
  })

  it('explains a second import of the same file, and starts over', async () => {
    inProjects({
      [`POST ${PREVIEW}`]: { status: 200, body: JIRA },
      [`POST ${IMPORT}`]: {
        status: 200,
        body: {
          source: 'jira',
          created: 0,
          skipped: 5,
          failed: 0,
          problems: [],
        },
      },
    })
    const { screen } = await reviewing()

    await screen.getByRole('button', { name: 'Import' }).click()

    await expect
      .element(
        screen.getByText(/5 rows were imported from this Jira export before/)
      )
      .toBeVisible()
    await screen.getByRole('button', { name: 'Import another file' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'Upload an export' }))
      .toBeVisible()
  })

  it('puts a refused mapping on its row, and anything else on the form', async () => {
    let calls = 0
    const requests = inProjects({
      [`POST ${PREVIEW}`]: { status: 200, body: JIRA },
      [`POST ${IMPORT}`]: {
        status: 422,
        body: () =>
          ++calls === 1
            ? problem(422, 'Validation failed', [
                {
                  field: 'mapping.statuses.In Review',
                  message: 'no such status in this project',
                },
              ])
            : problem(422, 'The export changed; upload it again.'),
      },
    })
    const { screen } = await reviewing()

    await screen.getByRole('button', { name: 'Import' }).click()
    await expect
      .element(screen.getByRole('listitem').filter({ hasText: /^In Review/ }))
      .toHaveTextContent('no such status in this project')
    await expect
      .element(screen.getByRole('listitem').filter({ hasText: /^Shipped/ }))
      .not.toHaveTextContent('no such status')

    await screen.getByRole('button', { name: 'Import' }).click()
    await expect
      .element(screen.getByRole('alert').filter({ hasText: 'changed' }))
      .toHaveTextContent('The export changed; upload it again.')
    expect(sent(requests, IMPORT)).toHaveLength(2)
  })

  it('asks for a status where the project has no match', async () => {
    const requests = inProjects({
      [`POST ${PREVIEW}`]: {
        status: 200,
        body: {
          ...JIRA,
          statuses: [
            { ...JIRA.statuses[0], name: 'Odd', suggested_status_id: null },
          ],
        },
      },
    })
    const { screen } = await reviewing()

    await screen.getByRole('button', { name: 'Import' }).click()

    await expect
      .element(screen.getByRole('listitem').filter({ hasText: /^Odd/ }))
      .toHaveTextContent('Pick a status.')
    expect(sent(requests, IMPORT)).toHaveLength(0)
  })

  it('has no sprints on a kanban board and sends none', async () => {
    const requests = inProjects({
      'GET /api/projects/OPS': { status: 200, body: OPS_ADMIN },
      'POST /api/projects/OPS/imports/preview': { status: 200, body: JIRA },
      'POST /api/projects/OPS/imports': {
        status: 200,
        body: {
          source: 'jira',
          created: 5,
          skipped: 0,
          failed: 0,
          problems: [],
        },
      },
    })
    const { screen } = await reviewing('/p/OPS/settings/import')

    expect(
      screen.getByRole('heading', { name: 'Sprints' }).elements()
    ).toHaveLength(0)
    await screen.getByRole('button', { name: 'Import' }).click()
    await expect
      .element(screen.getByRole('heading', { name: 'Import finished' }))
      .toBeVisible()
    const { mapping } = await mappingOf(
      sent(requests, '/api/projects/OPS/imports')[0]
    )
    expect(mapping.sprints).toEqual({})
    expect(
      screen.getByRole('link', { name: 'Open backlog' }).elements()
    ).toHaveLength(0)
  })

  it('draws only the visible rows of a long people list', async () => {
    const people = Array.from({ length: 300 }, (_, index) => ({
      name: `person${index}@example.com`,
      count: 1,
      member_id: null,
    }))
    inProjects({
      [`POST ${PREVIEW}`]: { status: 200, body: { ...JIRA, people } },
    })
    const { screen } = await reviewing()

    await expect
      .element(
        screen.getByRole('combobox', { name: 'Member for person0@example.com' })
      )
      .toBeVisible()
    const drawn = screen
      .getByRole('combobox', { name: /^Member for/ })
      .elements().length
    expect(drawn).toBeGreaterThan(5)
    expect(drawn).toBeLessThan(150)
  })
})

describe('empty project', () => {
  const EMPTY_BACKLOG = {
    ...WEB_BACKLOG,
    epics: [],
    sections: [{ sprint: null, issue_count: 0, total_points: 0, cards: [] }],
  }
  const EMPTY_BOARD = {
    ...OPS_BOARD,
    columns: OPS_BOARD.columns.map((column) => ({
      ...column,
      cards: [],
      issue_count: 0,
      over_limit: false,
    })),
  }
  const HINT = 'Bring your work from Jira or Linear'

  it('offers the import from an empty backlog', async () => {
    inProjects({
      'GET /api/projects/WEB/backlog': { status: 200, body: EMPTY_BACKLOG },
    })
    const { screen, router } = await renderApp('/p/WEB/backlog')

    await screen.getByRole('link', { name: HINT }).click()

    expect(router.state.location.pathname).toBe('/p/WEB/settings/import')
  })

  it('offers it on an empty kanban board to admins only', async () => {
    inProjects({
      'GET /api/projects/OPS': { status: 200, body: OPS_ADMIN },
      'GET /api/projects/OPS/board': { status: 200, body: EMPTY_BOARD },
    })
    const { screen } = await renderApp('/p/OPS/board')
    await expect.element(screen.getByRole('link', { name: HINT })).toBeVisible()
  })

  it('stays quiet for a member', async () => {
    inProjects({
      'GET /api/projects/OPS/board': { status: 200, body: EMPTY_BOARD },
    })
    const { screen } = await renderApp('/p/OPS/board')
    await expect
      .element(screen.getByRole('region', { name: 'To do', exact: true }))
      .toBeVisible()
    expect(screen.getByRole('link', { name: HINT }).elements()).toHaveLength(0)
  })
})
