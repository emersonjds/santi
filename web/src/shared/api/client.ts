import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

type Schemas = components['schemas']
export type Problem = Schemas['Problem']
export type User = Schemas['User']
export type Project = Schemas['Project']
export type MyProject = Schemas['MyProject']
export type HomeIssue = Schemas['HomeIssue']
export type MyItem = Schemas['MyItem']
type HomeQuery = NonNullable<
  paths['/api/me/issues']['get']['parameters']['query']
>
export type HomeView = NonNullable<HomeQuery['view']>
export type Member = Schemas['MemberInfo']
export type BoardType = Schemas['BoardType']
export type MemberRole = Schemas['MemberRole']
export type InviteInfo = Schemas['InviteInfo']
export type BoardView = Schemas['BoardView']
export type BoardColumn = Schemas['BoardColumnView']
export type BoardSettings = Schemas['BoardSettings']
export type Card = Schemas['Card']
export type IssueType = Schemas['IssueType']
export type Priority = Schemas['Priority']
export type Sprint = Schemas['Sprint']
export type Backlog = Schemas['Backlog']
export type BacklogSection = Schemas['BacklogSection']
export type CreateSprint = Schemas['CreateSprint']
export type UpdateSprint = Schemas['UpdateSprint']
export type CompleteSprint = Schemas['CompleteSprint']
export type UpdateIssue = Schemas['UpdateIssue']
export type Issue = Schemas['Issue']
export type Comment = Schemas['Comment']
export type CreateIssue = Schemas['CreateIssue']
export type FieldError = Schemas['FieldError']
export type ImportPreview = Schemas['ImportPreview']
export type ImportMapping = Schemas['ImportMapping']
export type ImportResult = Schemas['ImportResult']
export type SprintAction = Schemas['SprintAction']
export type ImportSource = Schemas['ImportSource']
export type SprintTotals = Schemas['SprintTotals']
export type Velocity = Schemas['Velocity']
export type SprintReport = Schemas['SprintReport']
export type ReportGroup = Schemas['ReportGroup']
export type ReportIssue = Schemas['ReportIssue']

// The session is an HttpOnly cookie (D22): no token ever reaches this code.
export const api = createClient<paths>({
  credentials: 'include',
  // Looked up per call so tests can stub the global fetch.
  fetch: (request) => globalThis.fetch(request),
})

export const formData = (file: File, fields: Record<string, unknown> = {}) => {
  const form = new FormData()
  form.append('file', file)
  for (const [name, value] of Object.entries(fields))
    form.append(name, JSON.stringify(value))
  return form
}

export class ApiError extends Error {
  status: number
  /** The D24 `errors[]`: which field the server refused, and why. */
  errors: FieldError[]

  constructor(status: number, detail: string, errors: FieldError[] = []) {
    super(detail)
    this.status = status
    this.errors = errors
  }
}

type Result<Data> = {
  data?: Data
  error?: { detail: string; errors?: FieldError[] }
  response: Response
}

const problemOf = ({ error, response }: Result<unknown>) =>
  new ApiError(
    response.status,
    error?.detail ?? response.statusText,
    error?.errors
  )

export const dataOrThrow = <Data>(result: Result<Data>) => {
  if (result.data !== undefined) return result.data
  throw problemOf(result)
}

/** For answers without a body (204): only the status tells success. */
export const okOrThrow = (result: Result<unknown>) => {
  if (!result.response.ok) throw problemOf(result)
}

export const fieldMessage = (error: Error) =>
  (error instanceof ApiError && error.errors[0]?.message) || error.message

export const hasStatus = (error: unknown, status: number) =>
  error instanceof ApiError && error.status === status
