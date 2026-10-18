import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { groupByDay } from '@/entities/home/day-buckets'
import { recentQuery } from '@/entities/home/home-queries'
import { useDebouncedValue } from '@/shared/lib/use-debounced-value'
import { LoadFailed } from '@/shared/ui/load-failed'
import {
  FlyoutNote,
  FlyoutRow,
  FlyoutSkeleton,
  LoadMore,
  SEARCH_DELAY,
  SidebarFlyout,
} from './sidebar-flyout'

const RecentList = ({
  q,
  onNavigate,
}: {
  q: string
  onNavigate: () => void
}) => {
  const list = useInfiniteQuery(recentQuery(q))
  const items = list.data?.pages.flatMap((page) => page.items)
  const failed = list.isError && (
    <LoadFailed
      message='Recent items did not load.'
      onRetry={() => void list.refetch()}
    />
  )
  if (!items) return failed || <FlyoutSkeleton label='Loading recent items' />
  if (items.length === 0)
    return q ? (
      <FlyoutNote
        heading='No matches'
        hint='Try another word, or see everything in For you.'
      />
    ) : (
      <FlyoutNote
        heading='Nothing viewed yet'
        hint='Projects and issues you open show up here.'
      />
    )
  return (
    <div className='grid gap-3'>
      {failed}
      {groupByDay(items).map(({ bucket, items: rows }) => (
        <section key={bucket} aria-label={bucket} className='grid gap-1'>
          <h3 className='px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
            {bucket}
          </h3>
          <ul className='grid'>
            {rows.map((item) => (
              <FlyoutRow key={item.key} item={item} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      ))}
      <LoadMore
        hasMore={list.hasNextPage}
        loading={list.isFetchingNextPage}
        onMore={list.fetchNextPage}
      />
    </div>
  )
}

/** UI-58/59. */
export const RecentFlyout = ({ onNavigate }: { onNavigate: () => void }) => {
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim(), SEARCH_DELAY)
  return (
    <SidebarFlyout
      title='Recent'
      search={{ label: 'Search recent', value: text, onChange: setText }}
      viewAll='viewed'
      onNavigate={onNavigate}
    >
      <RecentList q={q} onNavigate={onNavigate} />
    </SidebarFlyout>
  )
}
