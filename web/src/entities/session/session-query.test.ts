import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ALICE, problem, stubApi } from '@/test/stub-api'
import { sessionQuery } from './session-query'

const fetchSession = () => new QueryClient().fetchQuery(sessionQuery)

describe('session', () => {
  it('is the user the session cookie belongs to', async () => {
    stubApi({ 'GET /api/me': { status: 200, body: ALICE } })

    expect(await fetchSession()).toEqual(ALICE)
  })

  it('is null for an anonymous visitor', async () => {
    stubApi({ 'GET /api/me': { status: 401, body: problem(401, 'Sign in.') } })

    expect(await fetchSession()).toBeNull()
  })

  it('fails on any other answer', async () => {
    stubApi({ 'GET /api/me': { status: 500, body: problem(500, 'Boom.') } })

    await expect(fetchSession()).rejects.toThrow('GET /api/me answered 500')
  })
})
