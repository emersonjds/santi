import { describe, expect, it } from 'vitest'
import { WEB_BACKLOG, card } from '@/test/stub-api'
import { insertRow, moveRow, planRowMove, setEpic } from './backlog-cache'

const [ACTIVE, PLANNED, EMPTY, NO_SPRINT] = WEB_BACKLOG.sections
const [WEB_6, WEB_7] = NO_SPRINT.cards
const keys = (index: number, backlog = WEB_BACKLOG) =>
  backlog.sections[index].cards.map((each) => each.key)

describe('backlog cache', () => {
  it('anchors on the row above, or below for the top, and on nothing in an empty sprint (BL-6)', () => {
    expect(planRowMove(WEB_BACKLOG, WEB_6, 4, 9)).toEqual({
      card: WEB_6,
      toSprintId: 4,
      toIndex: 3,
      after: 'WEB-3',
    })
    expect(planRowMove(WEB_BACKLOG, WEB_7, null, 0)).toEqual({
      card: WEB_7,
      toSprintId: null,
      toIndex: 0,
      before: 'WEB-6',
    })
    expect(planRowMove(WEB_BACKLOG, WEB_6, 6, 0)).toEqual({
      card: WEB_6,
      toSprintId: 6,
      toIndex: 0,
      before: undefined,
    })
  })

  it('moves the row with its count and points, leaving other sections alone', () => {
    const moved = moveRow(WEB_BACKLOG, planRowMove(WEB_BACKLOG, WEB_7, 5, 0))

    expect(keys(1, moved)).toEqual(['WEB-7', 'WEB-4'])
    expect(moved.sections[1]).toMatchObject({ issue_count: 2, total_points: 7 })
    expect(moved.sections[1].cards[0].sprint_id).toBe(5)
    expect(keys(3, moved)).toEqual(['WEB-6'])
    expect(moved.sections[3]).toMatchObject({ issue_count: 1, total_points: 0 })
    expect(moved.sections[0]).toBe(ACTIVE)
    expect(moved.sections[2]).toBe(EMPTY)
  })

  it('reorders inside a section without touching its totals', () => {
    const moved = moveRow(WEB_BACKLOG, planRowMove(WEB_BACKLOG, WEB_7, null, 0))

    expect(keys(3, moved)).toEqual(['WEB-7', 'WEB-6'])
    expect(moved.sections[3]).toMatchObject({ issue_count: 2, total_points: 2 })
    expect(moved.sections[1]).toBe(PLANNED)
  })

  it('adds a new row once, an epic to the panel only, and never a subtask', () => {
    const story = card({
      key: 'WEB-12',
      summary: 'New',
      column_id: 1,
      points: 1,
    })
    const added = insertRow(WEB_BACKLOG, story)

    expect(keys(3, added)).toEqual(['WEB-6', 'WEB-7', 'WEB-12'])
    expect(added.sections[3]).toMatchObject({ issue_count: 3, total_points: 3 })
    expect(insertRow(added, story)).toBe(added)
    const epic = insertRow(WEB_BACKLOG, { ...story, issue_type: 'epic' })
    expect(epic.sections).toBe(WEB_BACKLOG.sections)
    expect(epic.epics.map((each) => each.key)).toEqual(['WEB-9', 'WEB-12'])
    expect(insertRow(epic, { ...story, issue_type: 'epic' })).toBe(epic)
    expect(insertRow(WEB_BACKLOG, { ...story, issue_type: 'subtask' })).toBe(
      WEB_BACKLOG
    )
  })
  it('moves a row between epics, recounting both, and leaves a no-op alone (D10)', () => {
    const [WEB_4] = PLANNED.cards
    expect(setEpic(WEB_BACKLOG, { card: WEB_6, epic: null })).toBe(WEB_BACKLOG)

    const cleared = setEpic(WEB_BACKLOG, { card: WEB_4, epic: null })
    expect(cleared.sections[1].cards[0].parent_key).toBeNull()
    expect(cleared.epics[0].child_count).toBe(0)

    const set = setEpic(cleared, { card: WEB_6, epic: 'WEB-9' })
    expect(set.sections[3].cards[0].parent_key).toBe('WEB-9')
    expect(set.epics[0].child_count).toBe(1)
  })
})
