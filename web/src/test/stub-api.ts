import { vi } from 'vitest'
import type {
  BoardSettings,
  BoardView,
  Card,
  Comment,
  Issue,
  Sprint,
} from '@/shared/api/client'

type Reply = { status: number; body?: unknown; until?: Promise<unknown> }

/** Answers `fetch` by `"METHOD /path"`; unknown calls get a 404 problem. Returns the requests seen. */
export const stubApi = (replies: Record<string, Reply>) => {
  const requests: Request[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    requests.push(request)
    const route = `${request.method} ${new URL(request.url).pathname}`
    const reply = replies[route] ?? { status: 404, body: problem(404, route) }
    await reply.until
    const body = reply.body === undefined ? null : JSON.stringify(reply.body)
    const type =
      reply.status >= 400 ? 'application/problem+json' : 'application/json'
    return new Response(body, {
      status: reply.status,
      headers: { 'content-type': type },
    })
  })
  return requests
}

/** Nobody is signed in; after signing in, the user has no projects. */
export const anonymous = (replies: Record<string, Reply> = {}) =>
  stubApi({
    'GET /api/me': { status: 401, body: problem(401, 'Sign in.') },
    'GET /api/projects': { status: 200, body: [] },
    ...replies,
  })

/** Alice is signed in and has no projects, unless `replies` says otherwise. */
export const signedIn = (replies: Record<string, Reply> = {}) =>
  stubApi({
    'GET /api/me': { status: 200, body: ALICE },
    'GET /api/projects': { status: 200, body: [] },
    ...replies,
  })

/** Alice is signed in with WEB (scrum, admin) and OPS (kanban, member) open. */
export const inProjects = (replies: Record<string, Reply> = {}) =>
  signedIn({
    'GET /api/projects': { status: 200, body: [WEB, OPS] },
    'GET /api/projects/WEB': { status: 200, body: WEB },
    'GET /api/projects/WEB/members': { status: 200, body: MEMBERS },
    'GET /api/projects/OPS': { status: 200, body: OPS },
    'GET /api/projects/OPS/members': { status: 200, body: MEMBERS },
    'GET /api/projects/WEB/board': { status: 200, body: WEB_BOARD },
    'GET /api/projects/WEB/board/settings': { status: 200, body: WEB_SETTINGS },
    'GET /api/projects/OPS/board': { status: 200, body: OPS_BOARD },
    'GET /api/projects/OPS/board/settings': { status: 200, body: OPS_SETTINGS },
    'GET /api/projects/WEB/sprints': { status: 200, body: WEB_SPRINTS },
    'GET /api/projects/WEB/issues/1': { status: 200, body: WEB_ISSUE },
    'GET /api/projects/WEB/issues/1/comments': {
      status: 200,
      body: { items: WEB_COMMENTS, next_cursor: null },
    },
    'GET /api/projects/WEB/issues': {
      status: 200,
      body: { items: [], next_cursor: null },
    },
    ...replies,
  })

export const routeOf = (request: Request) =>
  `${request.method} ${new URL(request.url).pathname}`

export const problem = (
  status: number,
  detail: string,
  errors?: { field: string; message: string }[]
) => ({ type: 'about:blank', title: 'Problem', status, detail, errors })

export const ALICE = {
  id: 1,
  email: 'alice@example.com',
  display_name: 'Alice',
}

export const WEB = {
  id: 1,
  key: 'WEB',
  name: 'Website',
  board_type: 'scrum',
  role: 'admin',
} as const

export const OPS = {
  id: 2,
  key: 'OPS',
  name: 'Operations',
  board_type: 'kanban',
  role: 'member',
} as const

export const MEMBERS = [
  {
    user_id: 1,
    email: 'alice@example.com',
    display_name: 'Alice',
    role: 'admin',
  },
  {
    user_id: 2,
    email: 'bob@example.com',
    display_name: 'Bob Stone',
    role: 'member',
  },
]

type CardFixture = Partial<Card> & Pick<Card, 'key' | 'summary' | 'column_id'>

/** A board card with quiet defaults: a medium story, unassigned, unestimated. */
export const card = (fields: CardFixture): Card => ({
  id: Number(fields.key.split('-')[1]),
  issue_type: 'story',
  priority: 'medium',
  status_id: fields.column_id * 10,
  labels: [],
  open_subtasks: 0,
  total_subtasks: 0,
  rank: fields.key,
  updated_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  assignee_id: null,
  assignee_name: null,
  parent_key: null,
  points: null,
  sprint_id: null,
  ...fields,
})

// Swedish dates read YYYY-MM-DD in local time, like the server's sprint dates.
const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString('sv')

const column = (
  id: number,
  name: string,
  cards: Card[],
  wip_limit?: number
) => ({
  id,
  name,
  cards,
  issue_count: cards.length,
  wip_limit: wip_limit ?? null,
  over_limit: wip_limit !== undefined && cards.length > wip_limit,
})

export const WEB_BOARD: BoardView = {
  board_type: 'scrum',
  sprint: {
    id: 4,
    name: 'Sprint 4',
    goal: 'Ship the board',
    state: 'active',
    overdue: false,
    start_date: inDays(-4),
    end_date: inDays(3),
  },
  columns: [
    column(1, 'To do', [
      card({ key: 'WEB-1', summary: 'Write the release notes', column_id: 1 }),
      card({
        key: 'WEB-2',
        summary: 'Fix the login redirect loop',
        column_id: 1,
        issue_type: 'bug',
        priority: 'urgent',
        points: 3,
        assignee_id: 2,
        assignee_name: 'Bob Stone',
        open_subtasks: 1,
        total_subtasks: 2,
      }),
    ]),
    column(2, 'In progress', [
      card({
        key: 'WEB-3',
        summary: 'Keep the redirect target',
        column_id: 2,
        issue_type: 'subtask',
        parent_key: 'WEB-2',
        assignee_id: 1,
        assignee_name: 'Alice',
      }),
    ]),
    column(3, 'Done', []),
  ],
}

const statuses = (columnId: number, ...names: string[]) =>
  names.map((name, index) => ({
    id: columnId * 10 + index,
    name,
    category: columnId === 3 ? ('done' as const) : ('todo' as const),
    column_id: columnId,
  }))

export const WEB_SETTINGS: BoardSettings = {
  board_type: 'scrum',
  done_window_days: null,
  unmapped: [],
  columns: [
    { id: 1, name: 'To do', position: 0, statuses: statuses(1, 'To do') },
    {
      id: 2,
      name: 'In progress',
      position: 1,
      statuses: statuses(2, 'In progress', 'In review'),
    },
    { id: 3, name: 'Done', position: 2, statuses: statuses(3, 'Done') },
  ],
}

export const OPS_BOARD: BoardView = {
  board_type: 'kanban',
  sprint: null,
  columns: [
    column(1, 'To do', [
      card({ key: 'OPS-1', summary: 'Rotate the certificates', column_id: 1 }),
    ]),
    column(
      2,
      'Doing',
      [
        card({ key: 'OPS-2', summary: 'Patch the gateway', column_id: 2 }),
        card({ key: 'OPS-3', summary: 'Resize the volume', column_id: 2 }),
      ],
      1
    ),
    column(3, 'Done', [], 5),
  ],
}

export const OPS_SETTINGS: BoardSettings = {
  ...WEB_SETTINGS,
  board_type: 'kanban',
  done_window_days: 14,
}

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString()

type IssueFixture = Partial<Issue> & Pick<Issue, 'key' | 'summary'>

/** An issue as its detail view loads it: a medium story in Sprint 4, reported by Alice. */
export const issue = (fields: IssueFixture): Issue => ({
  id: Number(fields.key.split('-')[1]),
  number: Number(fields.key.split('-')[1]),
  description: '',
  issue_type: 'story',
  priority: 'medium',
  status_id: 10,
  reporter_id: 1,
  labels: [],
  rank: fields.key,
  created_at: hoursAgo(48),
  updated_at: hoursAgo(3),
  assignee_id: null,
  parent_key: null,
  points: null,
  sprint_id: 4,
  done_at: null,
  ...fields,
})

export const WEB_ISSUE = issue({
  key: 'WEB-1',
  summary: 'Write the release notes',
  description: 'Cover the board.\nThen the backlog.',
  labels: ['docs'],
})

export const WEB_SPRINTS: Sprint[] = [
  { id: 3, name: 'Sprint 3', goal: '', state: 'closed', overdue: false },
  { id: 4, name: 'Sprint 4', goal: '', state: 'active', overdue: false },
  { id: 5, name: 'Sprint 5', goal: '', state: 'future', overdue: false },
]

export const WEB_COMMENTS: Comment[] = [
  {
    id: 1,
    author_id: 2,
    body: 'Draft is in the shared doc.',
    created_at: hoursAgo(2),
  },
]
