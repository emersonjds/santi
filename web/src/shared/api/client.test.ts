import { describe, expect, it } from 'vitest'
import { ApiError, dataOrThrow, hasStatus, okOrThrow } from './client'

describe('api results', () => {
  it('hands back the data of a success', () => {
    expect(dataOrThrow({ data: [1], response: new Response() })).toEqual([1])
  })

  it('throws the problem detail with the status', () => {
    const failure = () =>
      dataOrThrow({
        error: { detail: 'Not yours.' },
        response: new Response(null, { status: 404 }),
      })

    expect(failure).toThrow(new ApiError(404, 'Not yours.'))
  })

  it('falls back to the status text when there is no problem body', () => {
    const failure = () =>
      dataOrThrow({
        response: new Response(null, {
          status: 502,
          statusText: 'Bad Gateway',
        }),
      })

    expect(failure).toThrow('Bad Gateway')
  })

  it('accepts an empty success and throws an empty failure', () => {
    expect(
      okOrThrow({ response: new Response(null, { status: 204 }) })
    ).toBeUndefined()
    expect(() =>
      okOrThrow({
        error: { detail: 'Only a future sprint can be deleted.' },
        response: new Response(null, { status: 409 }),
      })
    ).toThrow(new ApiError(409, 'Only a future sprint can be deleted.'))
  })

  it('tells API failures apart by status', () => {
    expect(hasStatus(new ApiError(401, 'Sign in.'), 401)).toBe(true)
    expect(hasStatus(new ApiError(404, 'Gone.'), 401)).toBe(false)
    expect(hasStatus(new Error('offline'), 401)).toBe(false)
  })
})
