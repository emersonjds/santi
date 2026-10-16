import { type ReactNode, Suspense, lazy } from 'react'

/** D39: lists over 200 rows are virtualized. */
const VIRTUAL_AFTER = 200
// What the long list shows while the virtualizer's chunk loads.
const FIRST_SCREEN = 40

const VirtualRows = lazy(() =>
  import('./virtual-rows').then((module) => ({ default: module.VirtualRows }))
)

type LongRowsProps<Item> = {
  items: Item[]
  itemKey: (item: Item) => string
  renderItem: (item: Item) => ReactNode
}

const PlainRows = <Item,>({
  items,
  itemKey,
  renderItem,
}: LongRowsProps<Item>) =>
  items.map((item) => <li key={itemKey(item)}>{renderItem(item)}</li>)

/** The `li` rows of a list; past 200 only the visible ones are drawn. */
export const LongRows = <Item,>(props: LongRowsProps<Item>) => {
  const { items, itemKey, renderItem } = props
  if (items.length <= VIRTUAL_AFTER) return <PlainRows {...props} />
  return (
    <Suspense
      fallback={<PlainRows {...props} items={items.slice(0, FIRST_SCREEN)} />}
    >
      <VirtualRows
        count={items.length}
        keyAt={(index) => itemKey(items[index])}
        renderAt={(index) => renderItem(items[index])}
      />
    </Suspense>
  )
}
