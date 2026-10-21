import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { timeAgo } from '@/entities/issue/time-ago'
import { useTimeZone } from '@/entities/session/session-query'
import { sessionsQuery } from '@/entities/user/sessions'
import { api, dataOrThrow, okOrThrow } from '@/shared/api/client'
import { formatDate } from '@/shared/lib/format-date'
import { toast } from '@/shared/lib/toast'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { LoadFailed } from '@/shared/ui/load-failed'
import { Skeleton } from '@/shared/ui/skeleton'

type Ending = { id: number } | { others: true }

/** SAN-198: the caller's own session is marked, never offered for sign out here (the account menu does it). */
export const SessionsList = ({ headingId }: { headingId: string }) => {
  const queryClient = useQueryClient()
  const timeZone = useTimeZone()
  const sessions = useQuery(sessionsQuery)
  const list = useRef<HTMLUListElement>(null)
  const end = useMutation({
    mutationFn: async (ending: Ending) => {
      if ('id' in ending) {
        const result = await api.DELETE('/api/me/sessions/{id}', {
          params: { path: { id: ending.id } },
        })
        // 404: the session already ended elsewhere.
        if (result.response.status !== 404) okOrThrow(result)
        return
      }
      return dataOrThrow(await api.DELETE('/api/me/sessions')).signed_out
    },
    onSuccess: (signedOut, ending) => {
      const all = sessions.data ?? []
      const kept = all.filter((session) =>
        'id' in ending ? session.id !== ending.id : session.current
      )
      queryClient.setQueryData(sessionsQuery.queryKey, kept)
      if ('id' in ending) void queryClient.invalidateQueries(sessionsQuery)
      if (signedOut === undefined) toast.success('Signed out this session.')
      else
        toast.success(
          `Signed out ${signedOut} other session${signedOut === 1 ? '' : 's'}.`
        )
      const others = kept.filter((session) => !session.current)
      const removedAt = all
        .filter((session) => !session.current)
        .findIndex((session) => 'id' in ending && session.id === ending.id)
      const next = others[Math.min(removedAt, others.length - 1)]
      const target =
        next && removedAt >= 0
          ? list.current?.querySelector<HTMLElement>(
              `[data-session="${next.id}"]`
            )
          : document.getElementById(headingId)
      target?.focus()
    },
    onError: () => queryClient.invalidateQueries(sessionsQuery),
  })

  if (sessions.error)
    return (
      <LoadFailed
        message='Could not load your sessions.'
        onRetry={() => void sessions.refetch()}
      />
    )
  if (!sessions.data) return <Skeleton className='h-11' />
  const others = sessions.data.filter((session) => !session.current)
  if (others.length === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        Only this device is signed in.
      </p>
    )

  return (
    <div className='grid gap-3'>
      {end.isError && (
        <LoadFailed
          message='Could not sign out.'
          onRetry={() => end.variables && end.mutate(end.variables)}
        />
      )}
      <ul
        ref={list}
        aria-label='Sessions'
        className='grid max-h-96 gap-px overflow-y-auto rounded-md border bg-border'
      >
        {sessions.data.map((session) => (
          <li
            key={session.id}
            className='flex min-h-11 items-center gap-3 bg-card px-3 py-2'
          >
            <span className='grid min-w-0 flex-1'>
              <span className='flex flex-wrap items-center gap-2'>
                <span className='font-medium break-words'>
                  {session.client}
                </span>
                {session.current && (
                  <Badge variant='secondary'>This device</Badge>
                )}
              </span>
              <span className='text-xs text-muted-foreground'>
                Signed in{' '}
                {formatDate(
                  session.created_at,
                  { dateStyle: 'medium' },
                  timeZone
                )}
              </span>
              <span className='text-xs text-muted-foreground'>
                Active {timeAgo(session.last_used_at)}
              </span>
            </span>
            {!session.current && (
              <Button
                variant='outline'
                className='h-11 md:h-9'
                aria-label={`Sign out ${session.client}, signed in ${formatDate(
                  session.created_at,
                  { dateStyle: 'medium' },
                  timeZone
                )}, active ${timeAgo(session.last_used_at)}`}
                data-session={session.id}
                aria-disabled={end.isPending}
                onClick={() => !end.isPending && end.mutate({ id: session.id })}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button
        variant='outline'
        className='h-11 sm:w-fit md:h-9'
        disabled={end.isPending}
        onClick={() => end.mutate({ others: true })}
      >
        Sign out other sessions ({others.length})
      </Button>
    </div>
  )
}
