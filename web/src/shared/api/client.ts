import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

type Schemas = components['schemas']
export type Problem = Schemas['Problem']
export type User = Schemas['User']
export type Project = Schemas['Project']
export type Member = Schemas['MemberInfo']
export type BoardType = Schemas['BoardType']
export type MemberRole = Schemas['MemberRole']
export type BoardView = Schemas['BoardView']
export type BoardColumn = Schemas['BoardColumnView']
export type BoardSettings = Schemas['BoardSettings']
export type Card = Schemas['Card']
export type IssueType = Schemas['IssueType']
export type Priority = Schemas['Priority']
export type Sprint = Schemas['Sprint']

// The session is an HttpOnly cookie (D22): no token ever reaches this code.
export const api = createClient<paths>({
  credentials: 'include',
  // Looked up per call so tests can stub the global fetch.
  fetch: (request) => globalThis.fetch(request),
})

/** A failed API call, with the status the QueryClient handlers branch on. */
export class ApiError extends Error {
  status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

type Result<Data> = {
  data?: Data
  error?: { detail: string }
  response: Response
}

export const dataOrThrow = <Data>({ data, error, response }: Result<Data>) => {
  if (data !== undefined) return data
  throw new ApiError(response.status, error?.detail ?? response.statusText)
}

export const hasStatus = (error: unknown, status: number) =>
  error instanceof ApiError && error.status === status
