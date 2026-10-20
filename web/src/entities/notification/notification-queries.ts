import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, dataOrThrow } from '@/shared/api/client'

export const NOTIFICATIONS_KEY = ['notifications']

/** SAN-172 Q6: polled every minute and on focus; React Query skips the poll while the tab is hidden. */
export const unreadCountQuery = queryOptions({
  queryKey: [...NOTIFICATIONS_KEY, 'unread-count'],
  queryFn: async () =>
    dataOrThrow(await api.GET('/api/notifications/unread-count')),
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
})

export const notificationsQuery = (unread?: boolean) =>
  infiniteQueryOptions({
    queryKey: [...NOTIFICATIONS_KEY, 'list', { unread }],
    queryFn: async ({ pageParam }) =>
      dataOrThrow(
        await api.GET('/api/notifications', {
          params: { query: { unread, cursor: pageParam || undefined } },
        })
      ),
    // The cursor is the last id of the previous page: 0 is the first page.
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    select: ({ pages }) => pages.flatMap((page) => page.items),
  })
