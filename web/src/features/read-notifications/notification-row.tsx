import { Link } from '@tanstack/react-router'
import { mentionsAsText } from '@/features/rich-text/mention'
import { commentTime } from '@/entities/issue/comment-time'
import { UserAvatar } from '@/entities/user/user-avatar'
import type { Notification } from '@/shared/api/client'
import { shortName } from '@/shared/lib/initials'
import { cn } from '@/shared/lib/utils'
import { useMarkRead } from './read-notifications'

const line = ({ kind, actor_name, issue_key }: Notification) => {
  const actor = shortName(actor_name)
  if (kind === 'mention') return `${actor} mentioned you on ${issue_key}`
  if (kind === 'assigned') return `${actor} assigned ${issue_key} to you`
  return `${actor} commented on ${issue_key}`
}

const issueNumber = (key: string) => key.slice(key.lastIndexOf('-') + 1)

/** SAN-172 Q7: opens the issue at the comment and marks it read; the excerpt is untrusted, shown as text. */
export const NotificationRow = ({
  notification,
  onNavigate,
}: {
  notification: Notification
  onNavigate?: () => void
}) => {
  const markRead = useMarkRead()
  const unread = !notification.read_at
  return (
    <li>
      <Link
        to='/p/$key/issues/$number'
        params={{
          key: notification.project_key,
          number: issueNumber(notification.issue_key),
        }}
        hash={
          notification.comment_id
            ? `comment-${notification.comment_id}`
            : undefined
        }
        onClick={() => {
          if (unread) markRead.mutate(notification.id)
          onNavigate?.()
        }}
        className='flex min-h-11 gap-3 rounded-md p-2 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring'
      >
        <UserAvatar name={notification.actor_name} className='shrink-0' />
        <span className='grid min-w-0 flex-1 gap-0.5 text-sm'>
          <span
            className={cn(unread ? 'font-semibold' : 'text-muted-foreground')}
          >
            {line(notification)}
          </span>
          <span className='truncate'>{notification.issue_summary}</span>
          {notification.excerpt && (
            <span className='line-clamp-2 break-words text-muted-foreground'>
              {mentionsAsText(notification.excerpt)}
            </span>
          )}
          <time
            dateTime={notification.created_at}
            className='text-xs text-subtle-foreground'
          >
            {commentTime(notification.created_at)}
          </time>
        </span>
        {unread && (
          <span className='mt-1.5 size-2 shrink-0 rounded-full bg-primary'>
            <span className='sr-only'>Unread</span>
          </span>
        )}
      </Link>
    </li>
  )
}
