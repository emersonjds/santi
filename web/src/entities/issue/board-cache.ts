import type { BoardColumn, BoardView, Card } from '@/shared/api/client'

/** A card going to `toIndex` among the visible cards of a column, with the D4 anchor the server places it by. */
export type Move = {
  card: Card
  toColumnId: number
  toIndex: number
  after?: string
  before?: string
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

const recount = (column: BoardColumn, delta: number): BoardColumn => {
  const issue_count = column.issue_count + delta
  const over_limit = column.wip_limit != null && issue_count > column.wip_limit
  return { ...column, issue_count, over_limit }
}

/** The board as it will look once the move lands; counts follow the card (D7). */
export const moveCard = (board: BoardView, move: Move): BoardView => {
  const { card, toColumnId, toIndex } = move
  const changesColumn = card.column_id !== toColumnId
  const columns = board.columns.map((column) => {
    const cards = column.cards.filter((other) => other.key !== card.key)
    if (column.id === toColumnId) {
      cards.splice(toIndex, 0, { ...card, column_id: toColumnId })
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
