import { vi } from 'vitest'

type Reply = { status: number; body?: unknown }

/** Answers `fetch` by `"METHOD /path"`; unknown calls get a 404 problem. Returns the requests seen. */
export const stubApi = (replies: Record<string, Reply>) => {
  const requests: Request[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    requests.push(request)
    const route = `${request.method} ${new URL(request.url).pathname}`
    const reply = replies[route] ?? { status: 404, body: problem(404, route) }
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
