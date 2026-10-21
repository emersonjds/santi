import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { sessionQuery } from '@/entities/session/session-query'
import { api, dataOrThrow } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

const MAX_LENGTH = 100

const problemOf = (name: string) => {
  if (name === '') return 'Name is required.'
  if ([...name].length > MAX_LENGTH) return 'Name is too long.'
  return undefined
}

/** SAN-93: saves the name on blur or Enter when it changed; Escape puts the saved one back. */
export const DisplayNameField = ({ saved }: { saved: string }) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const lastSaved = useRef(saved)
  const [text, setText] = useState(saved)
  const [invalid, setInvalid] = useState<string>()
  const save = useMutation({
    mutationFn: async (display_name: string) =>
      dataOrThrow(await api.PATCH('/api/me', { body: { display_name } })),
    onSuccess: (user) => {
      lastSaved.current = user.display_name
      queryClient.setQueryData(sessionQuery.queryKey, user)
      // The shell reads the user from the route context, set once by beforeLoad.
      void router.invalidate()
    },
    onError: () => input.current?.focus(),
  })

  const commit = () => {
    if (save.isPending) return
    const name = text.trim()
    const problem = problemOf(name)
    setInvalid(problem)
    if (!problem && name !== lastSaved.current) save.mutate(name)
  }

  const length = [...text.trim()].length
  const message =
    invalid ?? (save.isError ? 'Could not save your name.' : undefined)

  return (
    <div className='grid gap-1.5'>
      <Label htmlFor='account-name'>Name</Label>
      <div className='relative'>
        <Input
          ref={input}
          id='account-name'
          value={text}
          readOnly={save.isPending}
          aria-invalid={message !== undefined}
          aria-describedby='account-name-status'
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key !== 'Escape') return
            setText(lastSaved.current)
            setInvalid(undefined)
            save.reset()
          }}
          className='h-11 pr-10 text-base md:text-sm'
        />
        {save.isPending && (
          <Loader2
            aria-hidden='true'
            className='absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground'
          />
        )}
      </div>
      <p
        id='account-name-status'
        role='status'
        className={cn(
          'flex min-h-5 justify-between gap-2 text-sm',
          message ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        <span>{message ?? (save.isSuccess && 'Saved')}</span>
        {length > MAX_LENGTH && <span>{`${length}/${MAX_LENGTH}`}</span>}
      </p>
    </div>
  )
}
