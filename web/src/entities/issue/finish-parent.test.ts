import { describe, expect, it } from 'vitest'
import { WEB_SETTINGS } from '@/test/stub-api'
import { closesLastSubtask, firstDoneStatus } from './finish-parent'

const TODO = 10
const DOING = 20
const DONE = 30
const after = (...statuses: number[]) =>
  statuses.map((status_id) => ({ status_id }))

describe('finishing a parent (SB-22)', () => {
  it('fires when an open subtask reaches done and every subtask is done', () => {
    expect(closesLastSubtask(DOING, after(DONE, DONE), WEB_SETTINGS)).toBe(true)
    expect(closesLastSubtask(TODO, after(DONE), WEB_SETTINGS)).toBe(true)
  })

  it('stays quiet while another subtask is open, or the change started at done', () => {
    expect(closesLastSubtask(DOING, after(DONE, TODO), WEB_SETTINGS)).toBe(
      false
    )
    expect(closesLastSubtask(DONE, after(DONE, DONE), WEB_SETTINGS)).toBe(false)
    expect(closesLastSubtask(DOING, after(DONE), undefined)).toBe(false)
    expect(closesLastSubtask(DOING, [], WEB_SETTINGS)).toBe(false)
  })

  it("takes the board's first done status", () => {
    expect(firstDoneStatus(WEB_SETTINGS)).toMatchObject({
      id: DONE,
      name: 'Done',
    })
    expect(firstDoneStatus(undefined)).toBeUndefined()
  })
})
