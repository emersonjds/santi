import { type ReactNode, use, useEffect, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { UseInfiniteQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Search, X } from 'lucide-react'
import { TypeGlyph } from '@/entities/issue/issue-glyphs'
import { TYPE_LABEL } from '@/entities/issue/labels'
import { timeAgo } from '@/entities/issue/time-ago'
import { BOARD_TYPE_LABEL } from '@/entities/project/labels'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import type { MyItem } from '@/shared/api/client'
import { Input } from '@/shared/ui/input'
import { LoadFailed } from '@/shared/ui/load-failed'
import { useSidebar } from '@/shared/ui/sidebar'
import { Skeleton } from '@/shared/ui/skeleton'
import { FlyoutControl } from './flyout-control'

const ICON_BUTTON =
  'grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8'

/** Set on the sidebar buttons that open a flyout. */
const FLYOUT_TRIGGER = 'data-flyout-trigger'

const ROW_HEIGHT = 'h-12'

export const SEARCH_DELAY = 250

const VIEW_ALL =
  'flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring md:min-h-9'

type FlyoutSearch = {
  label: string
  value: string
  onChange: (value: string) => void
}

type SidebarFlyoutProps = {
  title: string
  search?: FlyoutSearch
  tools?: ReactNode
  viewAll: 'viewed' | 'starred' | 'projects'
  onNavigate: () => void
  children: ReactNode
}

const beside = (start: number) => ({
  insetInlineStart: start,
  width: `min(24rem, calc(100vw - ${start}px))`,
})

/** UI-56/57/67: beside the sidebar from `md`, the whole screen below; the trigger lives in the sidebar. */
export const SidebarFlyout = ({
  title,
  search,
  tools,
  viewAll,
  onNavigate,
  children,
}: SidebarFlyoutProps) => {
  const input = useRef<HTMLInputElement>(null)
  const sidebar = useSidebar()
  const control = use(FlyoutControl)
  const start = sidebar.open ? sidebar.width : 0
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => open || control.close()}>
      <DialogPrimitive.Portal>
        {!sidebar.isMobile && (
          <DialogPrimitive.Overlay
            style={{ insetInlineStart: start }}
            className='fixed inset-0 z-50 bg-black/40'
          />
        )}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // The next flyout, opened by its own trigger, keeps the focus it took.
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!document.activeElement?.closest('[role=dialog]'))
              control.trigger.current?.focus()
          }}
          onOpenAutoFocus={(event) => {
            if (!input.current) return
            event.preventDefault()
            input.current.focus()
          }}
          // Another flyout's trigger switches flyouts on its own click.
          onPointerDownOutside={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest(`[${FLYOUT_TRIGGER}]`)
            )
              event.preventDefault()
          }}
          style={sidebar.isMobile ? undefined : beside(start)}
          className='fixed inset-0 z-50 flex flex-col bg-popover text-popover-foreground outline-none md:inset-e-auto md:border-e md:shadow-lg'
        >
          <div className='flex items-center gap-1 border-b py-1 ps-4 pe-1'>
            <DialogPrimitive.Title className='flex-1 text-base font-semibold'>
              {title}
            </DialogPrimitive.Title>
            {tools}
            <DialogPrimitive.Close className={ICON_BUTTON}>
              <X className='size-4' aria-hidden />
              <span className='sr-only'>Close</span>
            </DialogPrimitive.Close>
          </div>
          {search && (
            <div className='relative p-2'>
              <Search
                aria-hidden
                className='pointer-events-none absolute start-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
              />
              <Input
                ref={input}
                type='search'
                aria-label={search.label}
                placeholder={search.label}
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                className='h-11 ps-9 pe-12 text-base md:h-9 md:pe-10 [&::-webkit-search-cancel-button]:hidden'
              />
              {search.value && (
                <button
                  type='button'
                  aria-label='Clear search'
                  onClick={() => {
                    search.onChange('')
                    input.current?.focus()
                  }}
                  className={`${ICON_BUTTON} absolute inset-e-2 top-1/2 -translate-y-1/2`}
                >
                  <X className='size-4' aria-hidden />
                </button>
              )}
            </div>
          )}
          <div className='min-h-0 flex-1 overflow-y-auto p-2'>{children}</div>
          <div className='border-t p-2'>
            {viewAll === 'projects' ? (
              <Link to='/projects' onClick={onNavigate} className={VIEW_ALL}>
                See all projects
              </Link>
            ) : (
              <Link
                to='/'
                search={{ tab: viewAll }}
                onClick={onNavigate}
                className={VIEW_ALL}
              >
                See everything in For you
              </Link>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const number = (key: string) => key.slice(key.lastIndexOf('-') + 1)

const context = (item: MyItem) =>
  item.issue_type
    ? `${TYPE_LABEL[item.issue_type]} • ${item.key} • ${item.project_name}`
    : `${BOARD_TYPE_LABEL[item.board_type]} project`

const ROW_LINK =
  'flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring'

/** One project or issue: icon, name, context line, and the time (when it has one) or a trailing action. */
export const FlyoutRow = ({
  item,
  onNavigate,
  action,
}: {
  item: MyItem
  onNavigate: () => void
  action?: ReactNode
}) => {
  const body = (
    <>
      {item.issue_type ? (
        <TypeGlyph type={item.issue_type} />
      ) : (
        <ProjectAvatar name={item.name} />
      )}
      <span className='grid min-w-0 flex-1'>
        <span className='truncate text-sm'>{item.name}</span>
        <span className='truncate text-xs text-muted-foreground'>
          {context(item)}
        </span>
      </span>
      {!action && item.at && (
        <time
          dateTime={item.at}
          className='shrink-0 text-xs text-subtle-foreground'
        >
          {timeAgo(item.at)}
        </time>
      )}
    </>
  )
  return (
    <li className={`flex items-center ${ROW_HEIGHT}`}>
      {item.kind === 'issue' ? (
        <Link
          to='/p/$key/issues/$number'
          params={{ key: item.project_key, number: number(item.key) }}
          title={item.name}
          onClick={onNavigate}
          className={`${ROW_LINK} h-full`}
        >
          {body}
        </Link>
      ) : (
        <Link
          to='/p/$key'
          params={{ key: item.key }}
          title={item.name}
          onClick={onNavigate}
          className={`${ROW_LINK} h-full`}
        >
          {body}
        </Link>
      )}
      {action}
    </li>
  )
}

export const FlyoutSkeleton = ({ label }: { label: string }) => (
  <div role='status' aria-label={label} className='grid'>
    {[0, 1, 2, 3, 4].map((row) => (
      <Skeleton key={row} className={`${ROW_HEIGHT} my-px`} />
    ))}
  </div>
)

export const FlyoutNote = ({
  heading,
  hint,
}: {
  heading: string
  hint: string
}) => (
  <div className='grid gap-1 px-2 py-8 text-center'>
    <h3 className='text-sm font-semibold'>{heading}</h3>
    <p className='text-sm text-muted-foreground'>{hint}</p>
  </div>
)

type Pages = Pick<
  UseInfiniteQueryResult,
  | 'hasNextPage'
  | 'isFetchingNextPage'
  | 'isFetchNextPageError'
  | 'fetchNextPage'
>

/** UI-58: the next 15 load once the end scrolls into view; a failed page waits for Retry. */
export const LoadMore = ({ list }: { list: Pages }) => {
  const end = useRef<HTMLDivElement>(null)
  const hasMore = list.hasNextPage && !list.isFetchNextPageError
  const loading = list.isFetchingNextPage
  const onMore = list.fetchNextPage
  useEffect(() => {
    const node = end.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onMore()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading, onMore])
  if (list.isFetchNextPageError && !loading)
    return (
      <LoadFailed
        message='More items did not load.'
        onRetry={() => void onMore()}
      />
    )
  if (loading)
    return (
      <div role='status' aria-label='Loading more'>
        <Skeleton className={`${ROW_HEIGHT} my-px`} />
      </div>
    )
  return hasMore ? <div ref={end} className='h-px' /> : null
}
