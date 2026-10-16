import type { BoardColumn, BoardView, Card, Issue } from '@/shared/api/client'

/** A card going to `toIndex` among the visible cards of a column, with the D4 anchor the server places it by, or a status (SB-17). */
export type Move = {
  card: Card
  toColumnId: number
  toIndex: number
  after?: string
  before?: string
  statusId?: number
}

const cardsOf = (board: BoardView, columnId: number) =>
  board.columns.find((column) => column.id === columnId)?.cards ?? []

/** Anchors on the neighbour above, or below for the top slot; an empty column needs none. */
export const planMove = (
  board: BoardView,
  card: Card,
  toColumnId: number,
  toIndex: number
): Move => {
  const others = cardsOf(board, toColumnId).filter(
    (other) => other.key !== card.key
  )
  const index = Math.min(toIndex, others.length)
  if (index > 0)
    return { card, toColumnId, toIndex: index, after: others[index - 1].key }
  return { card, toColumnId, toIndex: 0, before: others[0]?.key }
}

/** Where a card sits among a column's cards by rank: a status change keeps the rank (D4). */
const rankIndex = (board: BoardView, card: Card, columnId: number) =>
  cardsOf(board, columnId).filter(
    (other) => other.key !== card.key && other.rank < card.rank
  ).length

/** SB-17: the card takes a status of the column, with no anchor so the server keeps its rank. */
export const statusMove = (
  board: BoardView,
  card: Card,
  toColumnId: number,
  statusId: number
): Move => ({
  card,
  toColumnId,
  toIndex: rankIndex(board, card, toColumnId),
  statusId,
})

export const recount = (column: BoardColumn, delta: number): BoardColumn => {
  const issue_count = column.issue_count + delta
  const over_limit = column.wip_limit != null && issue_count > column.wip_limit
  return { ...column, issue_count, over_limit }
}

/** The board as it will look once the move lands; counts follow the card (D7). */
export const moveCard = (board: BoardView, move: Move): BoardView => {
  const { card, toColumnId, toIndex, statusId = card.status_id } = move
  const changesColumn = card.column_id !== toColumnId
  const columns = board.columns.map((column) => {
    const cards = column.cards.filter((other) => other.key !== card.key)
    if (column.id === toColumnId) {
      cards.splice(toIndex, 0, {
        ...card,
        column_id: toColumnId,
        status_id: statusId,
      })
      return changesColumn
        ? recount({ ...column, cards }, 1)
        : { ...column, cards }
    }
    if (column.id === card.column_id && changesColumn)
      return recount({ ...column, cards }, -1)
    return cards.length === column.cards.length ? column : { ...column, cards }
  })
  return { ...board, columns }
}

export const patchCard = (
  board: BoardView,
  key: string,
  fields: Partial<Card>
): BoardView => ({
  ...board,
  columns: board.columns.map((column) =>
    column.cards.some((card) => card.key === key)
      ? {
          ...column,
          cards: column.cards.map((card) =>
            card.key === key ? { ...card, ...fields } : card
          ),
        }
      : column
  ),
})

/** After a status change: the card joins the column holding its new status, among its neighbours by rank. */
export const placeCard = (
  board: BoardView,
  key: string,
  columnId: number | undefined
): BoardView => {
  const card = board.columns
    .flatMap((column) => column.cards)
    .find((each) => each.key === key)
  const target = board.columns.find((column) => column.id === columnId)
  if (!card || !target || card.column_id === target.id) return board
  return moveCard(board, {
    card,
    toColumnId: target.id,
    toIndex: rankIndex(board, card, target.id),
  })
}

/** A new issue as a card; the assignee's name arrives with the next board refresh. */
export const cardOf = (issue: Issue, columnId: number): Card => ({
  id: issue.id,
  key: issue.key,
  summary: issue.summary,
  issue_type: issue.issue_type,
  priority: issue.priority,
  status_id: issue.status_id,
  column_id: columnId,
  labels: issue.labels,
  open_subtasks: 0,
  total_subtasks: 0,
  rank: issue.rank,
  updated_at: issue.updated_at,
  assignee_id: issue.assignee_id,
  assignee_name: null,
  parent_key: issue.parent_key,
  points: issue.points,
  sprint_id: issue.sprint_id,
})

/** A new card at the bottom of its column (D5), when the board shows it: kanban always, scrum in the running sprint. */
export const insertCard = (board: BoardView, card: Card): BoardView => {
  const shown =
    board.board_type === 'kanban' ||
    (board.sprint != null && card.sprint_id === board.sprint.id)
  const known = board.columns.some((column) =>
    column.cards.some((other) => other.key === card.key)
  )
  if (!shown || known) return board
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.id === card.column_id
        ? recount({ ...column, cards: [...column.cards, card] }, 1)
        : column
    ),
  }
}
