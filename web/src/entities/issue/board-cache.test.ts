import { describe, expect, it } from 'vitest'
import { OPS_BOARD } from '@/test/stub-api'
import { moveCard, patchCard, planMove } from './board-cache'
import { timeAgo } from './time-ago'

const OPS_1 = OPS_BOARD.columns[0].cards[0]

describe('board cache', () => {
  it('anchors on the card above, or below for the top, or nothing in an empty column', () => {
    expect(planMove(OPS_BOARD, OPS_1, 2, 9)).toMatchObject({
      toIndex: 2,
      after: 'OPS-3',
    })
    expect(planMove(OPS_BOARD, OPS_1, 2, 0)).toMatchObject({
      toIndex: 0,
      before: 'OPS-2',
    })
    expect(planMove(OPS_BOARD, OPS_1, 3, 0)).toEqual({
      card: OPS_1,
      toColumnId: 3,
      toIndex: 0,
      before: undefined,
    })
  })

  it('moves the card and its count, flagging a column pushed over its limit', () => {
    const moved = moveCard(OPS_BOARD, planMove(OPS_BOARD, OPS_1, 2, 0))

    const [todo, doing, done] = moved.columns
    expect(todo).toMatchObject({ cards: [], issue_count: 0 })
    expect(doing.cards.map((each) => each.key)).toEqual([
      'OPS-1',
      'OPS-2',
      'OPS-3',
    ])
    expect(doing).toMatchObject({ issue_count: 3, over_limit: true })
    expect(doing.cards[0].column_id).toBe(2)
    expect(done).toBe(OPS_BOARD.columns[2])
  })

  it('reorders inside a column without touching counts', () => {
    const second = OPS_BOARD.columns[1].cards[1]
    const moved = moveCard(OPS_BOARD, planMove(OPS_BOARD, second, 2, 0))

    expect(moved.columns[1].cards.map((each) => each.key)).toEqual([
      'OPS-3',
      'OPS-2',
    ])
    expect(moved.columns[1].issue_count).toBe(2)
  })

  it('patches one card and leaves the other columns as they were', () => {
    const patched = patchCard(OPS_BOARD, 'OPS-1', { priority: 'high' })

    expect(patched.columns[0].cards[0].priority).toBe('high')
    expect(patched.columns[1]).toBe(OPS_BOARD.columns[1])
  })

  it('says how long ago something changed', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    const at = (seconds: number) => new Date(now - seconds * 1000).toISOString()

    expect(timeAgo(at(10), now)).toBe('now')
    expect(timeAgo(at(5 * 60), now)).toBe('5 minutes ago')
    expect(timeAgo(at(86_400), now)).toBe('yesterday')
  })
})
