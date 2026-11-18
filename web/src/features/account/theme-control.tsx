import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionQuery } from '@/entities/session/session-query'
import { api, dataOrThrow } from '@/shared/api/client'
import { useT } from '@/shared/i18n/i18n'
import { type Theme, applyTheme } from '@/shared/lib/theme'
import { cn } from '@/shared/lib/utils'
import { messages } from './messages'

const THEMES = ['light', 'dark', 'system'] satisfies Theme[]

/** SAN-93: applies the choice at once, saves it to the account, and puts the last saved one back if the save fails. */
export const ThemeControl = ({ saved }: { saved: Theme }) => {
  const t = useT(messages)
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState(saved)
  const lastSaved = useRef(saved)
  const picked = useRef(saved)
  const save = useMutation({
    scope: { id: 'me' },
    mutationFn: async (theme: Theme) =>
      dataOrThrow(await api.PATCH('/api/me', { body: { theme } })),
    onSuccess: (user) => {
      lastSaved.current = user.theme
      queryClient.setQueryData(sessionQuery.queryKey, user)
    },
    onError: (_, theme) => {
      if (theme !== picked.current) return
      picked.current = lastSaved.current
      setChoice(lastSaved.current)
      applyTheme(lastSaved.current)
    },
  })

  const choose = (theme: Theme) => {
    picked.current = theme
    setChoice(theme)
    applyTheme(theme)
    save.mutate(theme)
  }

  return (
    <div className='grid gap-1.5'>
      <span id='theme-label' className='text-sm font-medium'>
        {t('theme')}
      </span>
      <div
        role='radiogroup'
        aria-labelledby='theme-label'
        aria-describedby='theme-status'
        className='grid grid-cols-3 gap-1 rounded-lg border bg-muted p-1'
      >
        {THEMES.map((theme) => (
          <label
            key={theme}
            className='relative flex h-11 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-xs has-focus-visible:ring-2 has-focus-visible:ring-ring md:h-9 dark:has-checked:bg-primary-fill dark:has-checked:text-primary-fill-foreground'
          >
            <input
              type='radio'
              name='theme'
              value={theme}
              checked={choice === theme}
              onChange={() => choose(theme)}
              className='absolute inset-0 cursor-pointer appearance-none opacity-0'
            />
            {t(theme)}
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
        {save.isError && t('themeFailed')}
        {save.isSuccess && t('saved')}
      </p>
    </div>
  )
}
