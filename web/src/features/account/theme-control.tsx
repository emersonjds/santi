import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionQuery } from '@/entities/session/session-query'
import { api, dataOrThrow } from '@/shared/api/client'
import { type Theme, applyTheme, isTheme } from '@/shared/lib/theme'
import { cn } from '@/shared/lib/utils'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'

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
      <RadioGroup
        aria-labelledby='theme-label'
        aria-describedby='theme-status'
        value={choice}
        onValueChange={(value) => {
          if (isTheme(value)) choose(value)
        }}
        className='grid grid-cols-3 gap-1 rounded-lg border bg-muted p-1'
      >
        {THEMES.map((theme) => (
          <label
            key={theme.value}
            className='relative flex h-11 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring has-data-[state=checked]:bg-background has-data-[state=checked]:text-foreground has-data-[state=checked]:shadow-xs md:h-9'
          >
            <RadioGroupItem
              value={theme.value}
              className='absolute inset-0 size-auto cursor-pointer opacity-0'
            />
            {theme.label}
          </label>
        ))}
      </RadioGroup>
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
