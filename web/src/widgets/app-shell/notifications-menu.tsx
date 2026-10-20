import { type ReactNode, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { NotificationRow } from '@/features/read-notifications/notification-row'
import { useMarkAllRead } from '@/features/read-notifications/read-notifications'
import {
  notificationsQuery,
  unreadCountQuery,
} from '@/entities/notification/notification-queries'
import { useIsMobile } from '@/shared/lib/use-mobile'
import { Button } from '@/shared/ui/button'
import { LoadFailed } from '@/shared/ui/load-failed'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Skeleton } from '@/shared/ui/skeleton'
import { NotificationsButton } from './notifications-button'

const TITLE_ID = 'notifications-title'
const TALL = 'h-11 md:h-9'

const NotificationList = ({ onNavigate }: { onNavigate: () => void }) => {
  const list = useInfiniteQuery(notificationsQuery())
  if (!list.data)
    return list.isError ? (
      <LoadFailed
        message='Notifications did not load.'
        action='Try again'
        onRetry={() => void list.refetch()}
      />
    ) : (
      <div role='status' aria-label='Loading notifications' className='grid'>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className='my-px h-20' />
        ))}
      </div>
    )
  if (list.data.length === 0)
    return (
      <p className='px-2 py-8 text-center text-sm text-muted-foreground'>
        You're all caught up.
      </p>
    )
  return (
    <>
      <ul className='grid'>
        {list.data.map((each) => (
          <NotificationRow
            key={each.id}
            notification={each}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      {list.hasNextPage && (
        <Button
          variant='ghost'
          className={`w-full ${TALL}`}
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </>
  )
}

const Panel = ({
  title,
  close,
  onNavigate,
}: {
  title: ReactNode
  close?: ReactNode
  onNavigate: () => void
}) => {
  const { data } = useQuery(unreadCountQuery)
  const markAll = useMarkAllRead()
  return (
    <>
      <div className='flex items-center gap-1 border-b py-1 ps-4 pe-1'>
        <div className='flex-1 text-base font-semibold'>{title}</div>
        {data?.count ? (
          <Button
            variant='ghost'
            className={TALL}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </Button>
        ) : null}
        {close}
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto p-2'>
        <NotificationList onNavigate={onNavigate} />
      </div>
    </>
  )
}

/** SAN-172 Q7: a popover from the bell; a sheet from the bottom on phones. */
export const NotificationsMenu = () => {
  const [open, setOpen] = useState(false)
  const narrow = useIsMobile()
  const close = () => setOpen(false)

  if (narrow)
    return (
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <NotificationsButton />
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-black/40' />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className='fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-xl border-t bg-popover text-popover-foreground outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom'
          >
            <Panel
              title={
                <DialogPrimitive.Title>Notifications</DialogPrimitive.Title>
              }
              close={
                <DialogPrimitive.Close asChild>
                  <Button variant='ghost' className='size-11 p-0'>
                    <X className='size-4' aria-hidden />
                    <span className='sr-only'>Close</span>
                  </Button>
                </DialogPrimitive.Close>
              }
              onNavigate={close}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <NotificationsButton />
      </PopoverTrigger>
      <PopoverContent
        role='dialog'
        aria-labelledby={TITLE_ID}
        align='end'
        className='flex max-h-[min(36rem,calc(100dvh-5rem))] w-96 flex-col p-0'
      >
        <Panel
          title={<h2 id={TITLE_ID}>Notifications</h2>}
          onNavigate={close}
        />
      </PopoverContent>
    </Popover>
  )
}
