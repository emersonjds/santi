import type { ComponentProps } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { unreadCountQuery } from '@/entities/notification/notification-queries'
import { Button } from '@/shared/ui/button'

/** SAN-172 Q6: the bell with the unread count, "9+" above 9. */
export const NotificationsButton = (props: ComponentProps<typeof Button>) => {
  const { data } = useQuery(unreadCountQuery)
  const count = data?.count ?? 0

  return (
    <Button
      variant='ghost'
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
      title='Notifications'
      className='relative size-11 shrink-0 rounded-full p-0 md:size-9'
      {...props}
    >
      <Bell className='size-5' aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className='absolute end-0 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-semibold text-primary-foreground'
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Button>
  )
}
