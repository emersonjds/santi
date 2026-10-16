import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/client'
import { createApp } from './create-app'

const retries = (failures: number, error: Error) => {
  const { retry } = createApp().queryClient.getDefaultOptions().queries ?? {}
  return typeof retry === 'function' ? retry(failures, error) : retry
}

describe('query retries', () => {
  it('never retries an answer the client caused', () => {
    expect(retries(0, new ApiError(404, 'Gone.'))).toBe(false)
  })

  it('retries server and network failures twice', () => {
    expect(retries(1, new ApiError(503, 'Busy.'))).toBe(true)
    expect(retries(1, new TypeError('Failed to fetch'))).toBe(true)
    expect(retries(2, new ApiError(503, 'Busy.'))).toBe(false)
  })
})
