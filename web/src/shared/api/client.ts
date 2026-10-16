import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export type Problem = components['schemas']['Problem']
export type User = components['schemas']['User']

// The session is an HttpOnly cookie (D22): no token ever reaches this code.
export const api = createClient<paths>({
  credentials: 'include',
  // Looked up per call so tests can stub the global fetch.
  fetch: (request) => globalThis.fetch(request),
})
