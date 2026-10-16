import type { Backlog, BacklogSection, Card } from '@/shared/api/client'

/** A row going to `toIndex` among the shown rows of a section (sprint id, `null` for the backlog), with its D4 anchor. */
export type RowMove = {
  card: Card
  toSprintId: number | null
  toIndex: number
  after?: string
  before?: string
}

const sprintOf = (section: BacklogSection) => section.sprint?.id ?? null

/** Anchors on the row above, or below for the top slot; an empty sprint needs none, so the rank stays (BL-6). */
export const planRowMove = (
  backlog: Backlog,
  card: Card,
  toSprintId: number | null,
  toIndex: number
): RowMove => {
  const rows =
    backlog.sections.find((section) => sprintOf(section) === toSprintId)
      ?.cards ?? []
  const others = rows.filter((other) => other.key !== card.key)
  const index = Math.min(toIndex, others.length)
  if (index > 0)
    return { card, toSprintId, toIndex: index, after: others[index - 1].key }
  return { card, toSprintId, toIndex: 0, before: others[0]?.key }
}

const tally = (section: BacklogSection, card: Card, sign: 1 | -1) => ({
  issue_count: section.issue_count + sign,
  total_points: section.total_points + sign * (card.points ?? 0),
})

/** The backlog once the move lands: the row and its count and points (D11) follow it. */
export const moveRow = (backlog: Backlog, move: RowMove): Backlog => {
  const { card, toSprintId, toIndex } = move
  const changes = (card.sprint_id ?? null) !== toSprintId
  const sections = backlog.sections.map((section) => {
    const cards = section.cards.filter((other) => other.key !== card.key)
    if (sprintOf(section) === toSprintId) {
      cards.splice(toIndex, 0, { ...card, sprint_id: toSprintId })
      return changes
        ? { ...section, cards, ...tally(section, card, 1) }
        : { ...section, cards }
    }
    if (cards.length === section.cards.length) return section
    return { ...section, cards, ...tally(section, card, -1) }
  })
  return { ...backlog, sections }
}
