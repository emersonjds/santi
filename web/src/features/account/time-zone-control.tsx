import { Suspense, lazy, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronsUpDown, Loader2 } from 'lucide-react'
import { sessionQuery } from '@/entities/session/session-query'
import { api, dataOrThrow } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'

// Lazy: the popover and the searchable list stay out of the first visit to /account (D39).
const TimeZonePicker = lazy(() =>
  import('./time-zone-picker').then((module) => ({
    default: module.TimeZonePicker,
  }))
)

/** SAN-93: shows the choice at once, saves it, and puts the last saved zone back if the save fails. */
export const TimeZoneControl = ({
  saved = null,
}: {
  saved?: string | null
}) => {
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState(saved)
  const lastSaved = useRef(saved)
  const picked = useRef(saved)
  const save = useMutation({
    scope: { id: 'me' },
    mutationFn: async (time_zone: string | null) =>
      dataOrThrow(await api.PATCH('/api/me', { body: { time_zone } })),
    onSuccess: (user) => {
      lastSaved.current = user.time_zone ?? null
      queryClient.setQueryData(sessionQuery.queryKey, user)
    },
    onError: (_, zone) => {
      if (zone !== picked.current) return
      picked.current = lastSaved.current
      setChoice(lastSaved.current)
    },
  })
  const browser = `Browser time zone (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
  const Icon = save.isPending ? Loader2 : ChevronsUpDown

  const trigger = (disabled: boolean) => (
    <Button
      id='time-zone'
      variant='outline'
      disabled={disabled}
      aria-describedby='time-zone-status'
      className='h-11 w-full justify-between text-base font-normal md:text-sm'
    >
      <span className='truncate'>{choice ?? browser}</span>
      <Icon
        aria-hidden='true'
        className={cn('opacity-50', save.isPending && 'animate-spin')}
      />
    </Button>
  )

  return (
    <div className='grid gap-1.5'>
      <Label htmlFor='time-zone'>Time zone</Label>
      <Suspense fallback={trigger(true)}>
        <TimeZonePicker
          browser={browser}
          current={choice}
          trigger={trigger(false)}
          onPick={(zone) => {
            picked.current = zone
            setChoice(zone)
            save.mutate(zone)
          }}
        />
      </Suspense>
      <p
        id='time-zone-status'
        role='status'
        className={cn(
          'min-h-5 text-sm',
          save.isError ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {save.isError && 'Could not save your time zone.'}
        {save.isSuccess && 'Saved'}
      </p>
    </div>
  )
}
