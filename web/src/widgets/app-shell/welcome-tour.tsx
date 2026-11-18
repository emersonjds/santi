import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import {
  FolderKanban,
  Keyboard,
  Search,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { sessionQuery } from '@/entities/session/session-query'
import { api, dataOrThrow } from '@/shared/api/client'
import { useT } from '@/shared/i18n/i18n'
import { useReturnFocus } from '@/shared/lib/use-return-focus'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui/dialog'
import { messages } from './welcome-tour/messages'

/** SAN-230 copy; keys separated by a space are pressed one after the other. */
const STEPS = [
  {
    icon: Sparkles,
    title: 'welcomeTitle',
    body: 'welcomeBody',
    keys: ['c'],
  },
  {
    icon: FolderKanban,
    title: 'boardTitle',
    body: 'boardBody',
    keys: ['g b', 'g l'],
  },
  {
    icon: Search,
    title: 'searchTitle',
    body: 'searchBody',
    keys: ['/', '⌘ K'],
  },
  {
    icon: UserPlus,
    title: 'inviteTitle',
    body: 'inviteBody',
    keys: [],
  },
  {
    icon: Keyboard,
    title: 'shortcutsTitle',
    body: 'shortcutsBody',
    keys: ['?'],
  },
] as const

type WelcomeTourProps = { first: boolean; onClose: () => void }

export const WelcomeTour = ({ first, onClose }: WelcomeTourProps) => {
  const t = useT(messages)
  const [at, setAt] = useState(0)
  const queryClient = useQueryClient()
  // SAN-230 A2: fire-and-forget; a failed write shows the tour again on the next sign-in.
  const markSeen = useMutation({
    scope: { id: 'me' },
    mutationFn: async () =>
      dataOrThrow(await api.PATCH('/api/me', { body: { tour_seen: true } })),
    onSuccess: (saved) =>
      queryClient.setQueryData(sessionQuery.queryKey, saved),
  })
  const close = () => {
    if (first) markSeen.mutate()
    onClose()
  }
  const returnFocus = useReturnFocus()
  const focusPage = (event: Event) => {
    event.preventDefault()
    document.getElementById('content')?.focus()
  }
  const next = useRef<HTMLButtonElement>(null)
  const pathname = useLocation({ select: (location) => location.pathname })
  const [openedOn] = useState(pathname)
  useEffect(() => {
    if (pathname !== openedOn) close()
  })
  const step = STEPS[at]
  const last = at === STEPS.length - 1

  return (
    <Dialog open onOpenChange={(open) => open || close()}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={first ? focusPage : returnFocus}
        className='flex flex-col max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-none max-sm:border-0 sm:max-w-md'
      >
        <step.icon className='size-8 text-primary' aria-hidden />
        <DialogTitle>{t(step.title)}</DialogTitle>
        <DialogDescription className='text-base'>
          {t(step.body)}
        </DialogDescription>
        {step.keys.length > 0 && (
          <div className='flex flex-wrap gap-3' aria-hidden>
            {step.keys.map((keys) => (
              <span key={keys} className='flex gap-1'>
                {keys.split(' ').map((key) => (
                  <kbd
                    key={key}
                    className='min-w-6 rounded-sm border bg-muted px-1.5 text-center text-xs'
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            ))}
          </div>
        )}
        <p role='status' className='text-sm text-muted-foreground'>
          {t('tourStep', { step: at + 1, total: STEPS.length })}
        </p>
        <div className='mt-auto flex flex-wrap gap-2 pt-2'>
          <Button
            variant='outline'
            className={at > 0 ? 'h-11' : 'invisible h-11'}
            disabled={at === 0}
            onClick={() => {
              setAt(at - 1)
              if (at === 1) next.current?.focus()
            }}
          >
            {t('back')}
          </Button>
          {last ? (
            <Button
              key='done'
              className='h-11'
              onClick={(event) => event.detail > 1 || close()}
            >
              {t('done')}
            </Button>
          ) : (
            <Button
              key='next'
              ref={next}
              className='h-11'
              onClick={() => setAt(at + 1)}
            >
              {t('next')}
            </Button>
          )}
          <Button variant='ghost' className='ms-auto h-11' onClick={close}>
            {t('skipTour')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
