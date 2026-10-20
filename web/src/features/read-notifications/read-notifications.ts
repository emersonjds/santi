import type { InfiniteData } from '@tanstack/react-query'
import { NOTIFICATIONS_KEY } from '@/entities/notification/notification-queries'
import {
  type Notification,
  type UnreadCount,
  api,
  okOrThrow,
} from '@/shared/api/client'
import { useOptimisticWrite } from '@/shared/lib/optimistic-write'

type View = UnreadCount | InfiniteData<{ items: Notification[] }>

/** `id` undefined: every notification. */
const markRead = (view: View, id?: number): View => {
  if ('count' in view)
    return { count: id === undefined ? 0 : Math.max(0, view.count - 1) }
  const at = new Date().toISOString()
  return {
    ...view,
    pages: view.pages.map((page) => ({
      ...page,
      items: page.items.map((each) =>
        each.read_at || (id !== undefined && each.id !== id)
          ? each
          : { ...each, read_at: at }
      ),
    })),
  }
}

export const useMarkRead = () =>
  useOptimisticWrite<View, number>({
    queryKey: NOTIFICATIONS_KEY,
    write: async (id) =>
      okOrThrow(
        await api.POST('/api/notifications/{id}/read', {
          params: { path: { id } },
        })
      ),
    change: markRead,
    failure: () => 'The notification was not marked as read',
  })

export const useMarkAllRead = () =>
  useOptimisticWrite<View, void>({
    queryKey: NOTIFICATIONS_KEY,
    write: async () => okOrThrow(await api.POST('/api/notifications/read-all')),
    change: (view) => markRead(view),
    failure: () => 'Notifications were not marked as read',
  })
