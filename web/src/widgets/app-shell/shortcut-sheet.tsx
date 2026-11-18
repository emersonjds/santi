import { useId, useState } from 'react'
import { Compass } from 'lucide-react'
import { useT } from '@/shared/i18n/i18n'
import { setShortcutsOn, shortcutsOn } from '@/shared/lib/shortcuts'
import { openTour } from '@/shared/lib/tour'
import { useReturnFocus } from '@/shared/lib/use-return-focus'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Label } from '@/shared/ui/label'
import { Switch } from '@/shared/ui/switch'
import { messages } from './shortcut-sheet/messages'

/** UI-37 groups; keys separated by a space are pressed one after the other. */
const GROUPS = [
  {
    title: 'global',
    rows: [
      ['c', 'createIssue'],
      ['/', 'searchProject'],
      ['⌘ K', 'jumpToProject'],
      ['g b', 'goToBoard'],
      ['g l', 'goToBacklog'],
      ['l', 'linkIssue'],
      ['?', 'showShortcuts'],
    ],
  },
  {
    title: 'navigation',
    rows: [
      ['j', 'nextIssue'],
      ['k', 'previousIssue'],
      ['n', 'nextColumn'],
      ['p', 'previousColumn'],
      ['Enter o', 'openIssue'],
      ['Esc', 'closeIssue'],
    ],
  },
  {
    title: 'issueActions',
    rows: [
      ['i', 'assignToMe'],
      ['a', 'changeAssignee'],
      ['m', 'commentOnIssue'],
      ['e', 'editSummary'],
    ],
  },
] as const

export const ShortcutSheet = ({ onClose }: { onClose: () => void }) => {
  const t = useT(messages)
  const [on, setOn] = useState(shortcutsOn)
  const id = useId()
  const returnFocus = useReturnFocus()

  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent
        onCloseAutoFocus={returnFocus}
        className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl'
      >
        <DialogTitle>{t('keyboardShortcuts')}</DialogTitle>
        <DialogDescription>{t('shortcutsHint')}</DialogDescription>
        <div className='flex min-h-11 items-center gap-3'>
          <Switch
            id={id}
            checked={on}
            onCheckedChange={(next) => {
              setShortcutsOn(next)
              setOn(next)
            }}
          />
          <Label htmlFor={id}>{t('useShortcuts')}</Label>
        </div>
        <div className='grid gap-6 sm:grid-cols-2'>
          {GROUPS.map((group) => (
            <section key={group.title} className='grid content-start gap-2'>
              <h3 className='text-sm font-semibold'>{t(group.title)}</h3>
              <dl className='grid gap-1.5 text-sm'>
                {group.rows.map(([keys, action]) => (
                  <div key={keys} className='flex items-center gap-3'>
                    <dt className='min-w-0 flex-1 text-muted-foreground'>
                      {t(action)}
                    </dt>
                    <dd className='flex gap-1'>
                      {keys.split(' ').map((key) => (
                        <kbd
                          key={key}
                          className='min-w-6 rounded-sm border bg-muted px-1.5 text-center text-xs'
                        >
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <Button
          variant='outline'
          className='h-11 justify-self-start'
          onClick={() => {
            onClose()
            openTour()
          }}
        >
          <Compass />
          {t('replayTour')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
