import type { ReactNode } from 'react'
import type { Card } from '@/shared/api/client'
import { LongRows } from '@/shared/lib/long-rows'

const LIST = 'mx-2 grid gap-px overflow-hidden rounded-md border bg-border'

type RowListProps = {
  cards: Card[]
  empty: string
  renderItem: (card: Card) => ReactNode
}

const keyOf = (card: Card) => card.key

/** A section's rows; an empty one is a dashed slot to drop issues into. */
export const RowList = ({ cards, empty, renderItem }: RowListProps) => {
  if (cards.length === 0)
    return (
      <p className='mx-2 rounded-md border border-dashed border-input px-3 py-4 text-center text-sm text-subtle-foreground'>
        {empty}
      </p>
    )
  return (
    <ul className={LIST}>
      <LongRows items={cards} itemKey={keyOf} renderItem={renderItem} />
    </ul>
  )
}
