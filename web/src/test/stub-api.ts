import { vi } from 'vitest'

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
