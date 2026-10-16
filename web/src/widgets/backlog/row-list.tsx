import { type ReactNode, Suspense, lazy } from 'react'
import type { Card } from '@/shared/api/client'

/** D39: lists over 200 rows are virtualized. */
export const VIRTUAL_AFTER = 200
// What the long list shows while the virtualizer's chunk loads.
const FIRST_SCREEN = 40

const VirtualRows = lazy(() =>
  import('./virtual-rows').then((module) => ({ default: module.VirtualRows }))
)

const LIST = 'mx-2 grid gap-px overflow-hidden rounded-md border bg-border'

type RowListProps = {
  cards: Card[]
  empty: string
  renderItem: (card: Card) => ReactNode
}

const PlainRows = ({ cards, renderItem }: Omit<RowListProps, 'empty'>) =>
  cards.map((card) => <li key={card.key}>{renderItem(card)}</li>)

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
      {cards.length > VIRTUAL_AFTER ? (
        <Suspense
          fallback={
            <PlainRows
              cards={cards.slice(0, FIRST_SCREEN)}
              renderItem={renderItem}
            />
          }
        >
          <VirtualRows cards={cards} renderItem={renderItem} />
        </Suspense>
      ) : (
        <PlainRows cards={cards} renderItem={renderItem} />
      )}
    </ul>
  )
}
