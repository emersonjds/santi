import { vi } from 'vitest'
import type {
  Backlog,
  BoardSettings,
  BoardView,
  Card,
  Comment,
  HomeIssue,
  Issue,
  Member,
  MyProject,
  Notification,
  ReportGroup,
  ReportIssue,
  Sprint,
  SprintReport,
  TeamProgress,
  User,
} from '@/shared/api/client'

/** `body` and `until` may be functions of the request, read on each call: a reply that changes once something was written, or with the query. */
type Reply = {
  status: number
  body?: unknown
  until?:
    | Promise<unknown>
    | ((request: Request) => Promise<unknown> | undefined)
}

/** Answers `fetch` by `"METHOD /path"`; unknown calls get a 404 problem. Returns the requests seen. */
export const stubApi = (replies: Record<string, Reply>) => {
  const requests: Request[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    requests.push(request)
    const route = `${request.method} ${new URL(request.url).pathname}`
    const reply = replies[route] ?? { status: 404, body: problem(404, route) }
    await (typeof reply.until === 'function'
      ? reply.until(request)
      : reply.until)
    const value =
      typeof reply.body === 'function' ? reply.body(request) : reply.body
    const body = value === undefined ? null : JSON.stringify(value)
    const type =
      reply.status >= 400 ? 'application/problem+json' : 'application/json'
    return new Response(body, {
      status: reply.status,
      headers: { 'content-type': type },
    })
  })
  return requests
}

const LEGAL_ACCEPTED = {
  required: true,
  terms_version: '2026-10-16',
  privacy_version: '2026-10-16',
  accepted: true,
}

/** Nobody is signed in; after signing in, the user has accepted the current terms and has no projects. */
export const anonymous = (replies: Record<string, Reply> = {}) =>
  stubApi({
    'GET /api/me': { status: 401, body: problem(401, 'Sign in.') },
    'GET /api/me/legal': { status: 200, body: LEGAL_ACCEPTED },
    'GET /api/projects': { status: 200, body: [] },
    'GET /api/me/projects': { status: 200, body: [] },
    'GET /api/me/issues': {
      status: 200,
      body: { items: [], next_cursor: null },
    },
    ...replies,
  })

/** Alice is signed in, has accepted the current terms and has no projects, unless `replies` says otherwise. */
export const signedIn = (replies: Record<string, Reply> = {}) =>
  stubApi({
    'GET /api/me': { status: 200, body: ALICE },
    'GET /api/me/legal': { status: 200, body: LEGAL_ACCEPTED },
    'GET /api/projects': { status: 200, body: [] },
    'GET /api/me/projects': { status: 200, body: [] },
    'GET /api/me/issues': {
      status: 200,
      body: { items: [], next_cursor: null },
    },
    'GET /api/notifications/unread-count': { status: 200, body: { count: 0 } },
    'GET /api/notifications': {
      status: 200,
      body: { items: [], next_cursor: null },
    },
    ...replies,
  })

/** Alice is signed in with WEB (scrum, admin) and OPS (kanban, member) open. */
export const inProjects = (replies: Record<string, Reply> = {}) =>
  signedIn({
    'GET /api/projects': { status: 200, body: [WEB, OPS] },
    'GET /api/me/projects': { status: 200, body: [MY_WEB, MY_OPS] },
    'GET /api/projects/WEB': { status: 200, body: WEB },
    'GET /api/projects/WEB/members': { status: 200, body: MEMBERS },
    'GET /api/projects/WEB/invites': { status: 200, body: [] },
    'GET /api/projects/OPS': { status: 200, body: OPS },
    'GET /api/projects/OPS/members': { status: 200, body: MEMBERS },
    'GET /api/projects/WEB/board': { status: 200, body: WEB_BOARD },
    'GET /api/projects/WEB/board/settings': { status: 200, body: WEB_SETTINGS },
    'GET /api/projects/OPS/board': { status: 200, body: OPS_BOARD },
    'GET /api/projects/OPS/board/settings': { status: 200, body: OPS_SETTINGS },
    'GET /api/projects/WEB/sprints': { status: 200, body: WEB_SPRINTS },
    'GET /api/projects/WEB/backlog': { status: 200, body: WEB_BACKLOG },
    'GET /api/projects/WEB/labels': { status: 200, body: ['docs', 'ui'] },
    'GET /api/projects/OPS/labels': { status: 200, body: [] },
    'GET /api/projects/WEB/issues/1': { status: 200, body: WEB_ISSUE },
    'POST /api/projects/WEB/issues/1/view': { status: 204 },
    'POST /api/projects/WEB/visit': { status: 204 },
    'POST /api/projects/OPS/visit': { status: 204 },
    'GET /api/projects/WEB/issues/1/comments': {
      status: 200,
      body: { items: WEB_COMMENTS, next_cursor: null },
    },
    'GET /api/projects/WEB/issues': {
      status: 200,
      body: { items: [], next_cursor: null },
    },
    'GET /api/projects/WEB/issues/1/attachments': { status: 200, body: [] },
    'GET /api/projects/WEB/people': { status: 200, body: WEB_PEOPLE },
    'GET /api/projects/OPS/people': { status: 200, body: OPS_PEOPLE },
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
  theme: 'system',
  time_zone: null,
} satisfies User

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

/** WEB and OPS as the home lists them: WEB starred, two open issues assigned to Alice in OPS. */
export const MY_WEB: MyProject = {
  key: 'WEB',
  name: 'Website',
  board_type: 'scrum',
  role: 'admin',
  lead_name: 'Alice',
  starred: true,
  open_assigned: 1,
}

export const MY_OPS: MyProject = {
  key: 'OPS',
  name: 'Operations',
  board_type: 'kanban',
  role: 'member',
  lead_name: 'Bob Stone',
  starred: false,
  open_assigned: 2,
}

/** A home row with quiet defaults: an unstarred, unassigned WEB story touched just now. */
export const homeIssue = (
  fields: Partial<HomeIssue> & Pick<HomeIssue, 'key' | 'summary'>
): HomeIssue => ({
  issue_type: 'story',
  status_category: 'todo',
  project_key: 'WEB',
  project_name: 'Website',
  assignee_name: null,
  starred: false,
  at: new Date().toISOString(),
  ...fields,
})

export const MEMBERS: Member[] = [
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

type NotificationFixture = Partial<Notification> &
  Pick<Notification, 'id' | 'kind'>

/** Bob Stone, two hours ago, on WEB-1, unread, with no comment and no excerpt. */
export const notification = (fields: NotificationFixture): Notification => ({
  actor_id: 2,
  actor_name: 'Bob Stone',
  project_key: 'WEB',
  issue_key: 'WEB-1',
  issue_summary: 'Write the release notes',
  comment_id: null,
  excerpt: '',
  created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  read_at: null,
  ...fields,
})

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
  reporter_id: 1,
  parent_key: null,
  points: null,
  sprint_id: null,
  ...fields,
})

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString()

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
    starts_at: inDays(-4),
    ends_at: inDays(3),
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
        total_subtasks: 3,
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

const tally = (issues: number, points: number) => ({ issues, points })

/** Sprint 4 by person: Bob has two stuck issues, Alice none, then the unassigned ones. */
export const WEB_PEOPLE: TeamProgress = {
  sprint: WEB_BOARD.sprint,
  people: [
    {
      user_id: 2,
      name: 'Bob Stone',
      to_do: tally(2, 3),
      in_progress: tally(3, 5),
      done: tally(3, 5),
      stuck: 2,
    },
    {
      user_id: 1,
      name: 'Alice',
      to_do: tally(1, 0),
      in_progress: tally(1, 0),
      done: tally(0, 0),
      stuck: 0,
    },
    {
      user_id: null,
      name: null,
      to_do: tally(1, 0),
      in_progress: tally(0, 0),
      done: tally(0, 0),
      stuck: 0,
    },
  ],
}

/** The OPS board by person: everything is unassigned. */
export const OPS_PEOPLE: TeamProgress = {
  sprint: null,
  people: [
    {
      user_id: null,
      name: null,
      to_do: tally(1, 0),
      in_progress: tally(2, 0),
      done: tally(0, 0),
      stuck: 0,
    },
  ],
}

const CATEGORY = { 1: 'todo', 2: 'in_progress', 3: 'done' } as const

const statuses = (columnId: 1 | 2 | 3, ...names: string[]) =>
  names.map((name, index) => ({
    id: columnId * 10 + index,
    name,
    category: CATEGORY[columnId],
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
  status_name: 'To Do',
  reporter_id: 1,
  reporter_name: 'Alice',
  labels: [],
  rank: fields.key,
  created_at: hoursAgo(48),
  updated_at: hoursAgo(3),
  assignee_id: null,
  assignee_name: null,
  parent_key: null,
  points: null,
  sprint_id: 4,
  sprint_name: 'Sprint 4',
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
    author_name: 'Bob Stone',
    body: 'Draft is in the shared doc.',
    created_at: hoursAgo(2),
  },
]

/** Sprint 4 running (3 open issues), Sprint 5 planned with one, Sprint 6 empty, two issues in no sprint. */
export const WEB_BACKLOG: Backlog = {
  epics: [
    {
      key: 'WEB-9',
      summary: 'Checkout revamp',
      child_count: 1,
      done_child_count: 0,
      done: false,
    },
  ],
  sections: [
    {
      sprint: WEB_BOARD.sprint,
      issue_count: 3,
      total_points: 3,
      cards: WEB_BOARD.columns
        .flatMap((each) => each.cards)
        .map((each) => ({ ...each, sprint_id: 4 })),
    },
    {
      sprint: {
        id: 5,
        name: 'Sprint 5',
        goal: '',
        state: 'future',
        overdue: false,
      },
      issue_count: 1,
      total_points: 5,
      cards: [
        card({
          key: 'WEB-4',
          summary: 'Pay with a saved card',
          column_id: 1,
          points: 5,
          parent_key: 'WEB-9',
          sprint_id: 5,
        }),
      ],
    },
    {
      sprint: {
        id: 6,
        name: 'Sprint 6',
        goal: '',
        state: 'future',
        overdue: false,
      },
      issue_count: 0,
      total_points: 0,
      cards: [],
    },
    {
      sprint: null,
      issue_count: 2,
      total_points: 2,
      cards: [
        card({
          key: 'WEB-6',
          summary: 'Audit the cookie banner',
          column_id: 1,
        }),
        card({
          key: 'WEB-7',
          summary: 'Translate the help pages',
          column_id: 1,
          issue_type: 'task',
          points: 2,
        }),
      ],
    },
  ],
}

type ReportIssueFixture = Partial<ReportIssue> &
  Pick<ReportIssue, 'key' | 'summary'>

/** A report row: a medium story, done, 3 points from start to end, there from the start. */
export const reportIssue = (fields: ReportIssueFixture): ReportIssue => ({
  issue_type: 'story',
  priority: 'medium',
  status_name: 'Done',
  status_category: 'done',
  epic_key: null,
  epic_summary: null,
  points_at_start: 3,
  points_at_end: 3,
  added_after_start: false,
  ...fields,
})

const emptyGroup = (outcome: ReportGroup['outcome']): ReportGroup => ({
  outcome,
  points_at_start: null,
  points_at_end: null,
  issues: [],
  deleted: null,
})

/** The report of a closed WEB sprint with no neighbors and three empty groups. */
export const sprintReport = (
  id: number,
  fields: Partial<SprintReport> = {}
): SprintReport => ({
  sprint: {
    id,
    name: `Sprint ${id}`,
    goal: '',
    state: 'closed',
    overdue: false,
    starts_at: '2026-09-01T04:00:00Z',
    ends_at: '2026-09-15T03:59:00Z',
  },
  newer_sprint_id: null,
  older_sprint_id: null,
  committed: 8,
  completed: 5,
  groups: [
    emptyGroup('completed'),
    emptyGroup('not_completed'),
    emptyGroup('removed'),
  ],
  ...fields,
})
