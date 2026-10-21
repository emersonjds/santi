import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionQuery } from '@/entities/session/session-query'
import { api, dataOrThrow } from '@/shared/api/client'
import { type Theme, applyTheme } from '@/shared/lib/theme'
import { cn } from '@/shared/lib/utils'

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] satisfies { value: Theme; label: string }[]

/** SAN-93: applies the choice at once, saves it to the account, and puts the last saved one back if the save fails. */
export const ThemeControl = ({ saved }: { saved: Theme }) => {
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState(saved)
  const lastSaved = useRef(saved)
  const save = useMutation({
    mutationFn: async (theme: Theme) =>
      dataOrThrow(await api.PATCH('/api/me', { body: { theme } })),
    onSuccess: (user) => {
      lastSaved.current = user.theme
      queryClient.setQueryData(sessionQuery.queryKey, user)
    },
    onError: () => {
      setChoice(lastSaved.current)
      applyTheme(lastSaved.current)
    },
  })

  const choose = (theme: Theme) => {
    setChoice(theme)
    applyTheme(theme)
    save.mutate(theme)
  }

  return (
    <div className='grid gap-1.5'>
      <span id='theme-label' className='text-sm font-medium'>
        Theme
      </span>
      <div
        role='radiogroup'
        aria-labelledby='theme-label'
        aria-describedby='theme-status'
        className='grid grid-cols-3 gap-1 rounded-lg border bg-muted p-1'
      >
        {THEMES.map((theme) => (
          <label
            key={theme.value}
            className='relative flex h-11 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-xs has-focus-visible:ring-2 has-focus-visible:ring-ring md:h-9'
          >
            <input
              type='radio'
              name='theme'
              value={theme.value}
              checked={choice === theme.value}
              onChange={() => choose(theme.value)}
              className='absolute inset-0 cursor-pointer appearance-none opacity-0'
            />
            {theme.label}
          </label>
        ))}
      </div>
      <p
        id='theme-status'
        role='status'
        className={cn(
          'min-h-5 text-sm',
          save.isError ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {save.isError && 'Could not save your theme.'}
        {save.isSuccess && 'Saved'}
      </p>
    </div>
  )
}
