import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { StarItemButton } from '@/features/star/star-button'
import { type StarredKind, starredQuery } from '@/entities/home/home-queries'
import { useDebouncedValue } from '@/shared/lib/use-debounced-value'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { LoadFailed } from '@/shared/ui/load-failed'
import {
  FlyoutNote,
  FlyoutRow,
  FlyoutSkeleton,
  LoadMore,
  SEARCH_DELAY,
  SidebarFlyout,
} from './sidebar-flyout'

const KINDS = [
  ['all', 'All'],
  ['project', 'Projects'],
  ['issue', 'Issues'],
] as const

type Kind = (typeof KINDS)[number][0]

const isKind = (value: string): value is Kind =>
  KINDS.some(([kind]) => kind === value)

const KindMenu = ({
  kind,
  onChange,
}: {
  kind: Kind
  onChange: (kind: Kind) => void
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger className='inline-flex h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:h-8'>
      Type: {KINDS.find(([value]) => value === kind)?.[1]}
      <ChevronDown className='size-4' aria-hidden />
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end'>
      <DropdownMenuRadioGroup
        value={kind}
        onValueChange={(value) => isKind(value) && onChange(value)}
      >
        {KINDS.map(([value, label]) => (
          <DropdownMenuRadioItem
            key={value}
            value={value}
            className='h-11 md:h-8'
          >
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
)

/** UI-60. */
export const StarredFlyout = ({ onNavigate }: { onNavigate: () => void }) => {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const q = useDebouncedValue(text.trim(), SEARCH_DELAY)
  const filter: StarredKind | undefined = kind === 'all' ? undefined : kind
  const list = useInfiniteQuery(starredQuery(filter, q))
  const items = list.data?.pages.flatMap((page) => page.items)
  const nothingStarred = items?.length === 0 && !q && !filter
  const failed = list.isError && (
    <LoadFailed
      message='Starred items did not load.'
      onRetry={() => void list.refetch()}
    />
  )

  const body = () => {
    if (!items)
      return failed || <FlyoutSkeleton label='Loading starred items' />
    if (nothingStarred)
      return (
        <FlyoutNote
          heading='Nothing starred yet'
          hint='Use the star next to a project or issue to keep it here.'
        />
      )
    if (items.length === 0)
      return (
        <FlyoutNote
          heading='No matches'
          hint='Try another word or type, or see everything in For you.'
        />
      )
    return (
      <div className='grid gap-2'>
        {failed}
        <ul className='grid'>
          {items.map((item) => (
            <FlyoutRow
              key={item.key}
              item={item}
              onNavigate={onNavigate}
              action={<StarItemButton item={item} />}
            />
          ))}
        </ul>
        <LoadMore
          hasMore={list.hasNextPage}
          loading={list.isFetchingNextPage}
          onMore={list.fetchNextPage}
        />
      </div>
    )
  }

  return (
    <SidebarFlyout
      title='Starred'
      search={
        nothingStarred
          ? undefined
          : { label: 'Search starred', value: text, onChange: setText }
      }
      tools={
        nothingStarred ? undefined : <KindMenu kind={kind} onChange={setKind} />
      }
      viewAll='starred'
      onNavigate={onNavigate}
    >
      {body()}
    </SidebarFlyout>
  )
}
