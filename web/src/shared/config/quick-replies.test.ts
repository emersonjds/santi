import { describe, expect, it } from 'vitest'
import { quickRepliesOn } from './quick-replies'

describe('quick replies at build time', () => {
  it('ship unless the operator builds with VITE_QUICK_REPLIES=off', () => {
    expect(quickRepliesOn({})).toBe(true)
    expect(quickRepliesOn({ VITE_QUICK_REPLIES: 'on' })).toBe(true)
    expect(quickRepliesOn({ VITE_QUICK_REPLIES: 'off' })).toBe(false)
  })
})
