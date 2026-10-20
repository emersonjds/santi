import { useInfiniteQuery } from '@tanstack/react-query'
import { NotificationRow } from '@/features/read-notifications/notification-row'
import { notificationsQuery } from '@/entities/notification/notification-queries'

const SHOWN = 5

/** SAN-172 Q8: nothing at all when no mention is unread. */
export const UnreadMentions = () => {
  const { data } = useInfiniteQuery(notificationsQuery(true))
  const mentions = (data ?? [])
    .filter((each) => each.kind === 'mention')
    .slice(0, SHOWN)
  if (mentions.length === 0) return null
  return (
    <section aria-labelledby='unread-mentions' className='grid gap-3'>
      <h2
        id='unread-mentions'
        className='text-sm font-semibold text-muted-foreground'
      >
        Unread mentions
      </h2>
      <ul className='grid rounded-md border p-1'>
        {mentions.map((each) => (
          <NotificationRow key={each.id} notification={each} />
        ))}
      </ul>
    </section>
  )
}
