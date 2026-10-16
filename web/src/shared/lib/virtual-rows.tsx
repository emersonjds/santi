import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

// One dense row on wide screens; rows are measured once drawn, so phones' two-line rows correct it.
const ROW_HEIGHT = 45
const OVERSCAN = 10

type VirtualRowsProps = {
  count: number
  keyAt: (index: number) => string
  renderAt: (index: number) => ReactNode
}

/** D39: only the rows in view (plus a margin) are in the DOM; spacers keep the list's full height. */
export const VirtualRows = ({ count, keyAt, renderAt }: VirtualRowsProps) => {
  const top = useRef<HTMLLIElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    const offset = top.current?.getBoundingClientRect().top ?? 0
    setScrollMargin(offset + window.scrollY)
  }, [])
  const virtualizer = useWindowVirtualizer({
    count,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
    getItemKey: keyAt,
  })
  const drawn = virtualizer.getVirtualItems()
  const first = drawn[0]?.start ?? scrollMargin
  const last = drawn[drawn.length - 1]?.end ?? scrollMargin
  const total = virtualizer.getTotalSize()

  return (
    <>
      <li
        ref={top}
        aria-hidden='true'
        style={{ height: first - scrollMargin }}
      />
      {drawn.map((item) => (
        <li
          key={item.key}
          data-index={item.index}
          ref={virtualizer.measureElement}
        >
          {renderAt(item.index)}
        </li>
      ))}
      <li
        aria-hidden='true'
        style={{ height: total - (last - scrollMargin) }}
      />
    </>
  )
}
