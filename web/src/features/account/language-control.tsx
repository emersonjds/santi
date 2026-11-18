import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionQuery } from '@/entities/session/session-query'
import { api, dataOrThrow } from '@/shared/api/client'
import {
  type Language,
  offeredLanguages,
  switchLanguage,
  useT,
} from '@/shared/i18n/i18n'
import { cn } from '@/shared/lib/utils'
import { Label } from '@/shared/ui/label'
import { NativeSelect } from '@/shared/ui/native-select'
import { messages } from './messages'

/** SAN-199: switches the UI once the language's chunk is in, saves it, and puts the last saved one back if either fails. */
export const LanguageControl = ({ saved }: { saved: Language }) => {
  const t = useT(messages)
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState(saved)
  const lastSaved = useRef(saved)
  const picked = useRef(saved)
  const putBack = (language: Language) => {
    if (language !== picked.current) return
    picked.current = lastSaved.current
    setChoice(lastSaved.current)
    switchLanguage(lastSaved.current).catch(() => {})
  }
  const save = useMutation({
    scope: { id: 'me' },
    mutationFn: async (language: Language) =>
      dataOrThrow(await api.PATCH('/api/me', { body: { language } })),
    onSuccess: (user) => {
      lastSaved.current = user.language
      queryClient.setQueryData(sessionQuery.queryKey, user)
    },
    onError: (_, language) => putBack(language),
  })
  const load = useMutation({
    mutationFn: (language: Language) => switchLanguage(language),
    onSuccess: (_, language) => {
      if (language === picked.current) save.mutate(language)
    },
    onError: (_, language) => putBack(language),
  })
  const offered = offeredLanguages()
  const failed = load.isError || save.isError

  return (
    <div className='grid gap-1.5'>
      <Label htmlFor='language'>{t('language')}</Label>
      <NativeSelect
        id='language'
        value={choice}
        aria-describedby='language-status'
        className='w-full px-3 md:h-11'
        onChange={(event) => {
          const language = offered[event.target.selectedIndex].value
          picked.current = language
          setChoice(language)
          load.mutate(language)
        }}
      >
        {offered.map((language) => (
          <option
            key={language.value}
            value={language.value}
            lang={language.value}
          >
            {language.name}
          </option>
        ))}
      </NativeSelect>
      <p
        id='language-status'
        role='status'
        className={cn(
          'min-h-5 text-sm',
          failed ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {failed ? t('languageFailed') : save.isSuccess && t('saved')}
      </p>
    </div>
  )
}
