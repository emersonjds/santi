import { useId, useState } from 'react'
import { setShortcutsOn, shortcutsOn } from '@/shared/lib/shortcuts'
import { useReturnFocus } from '@/shared/lib/use-return-focus'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Label } from '@/shared/ui/label'
import { Switch } from '@/shared/ui/switch'

/** UI-37 groups; keys separated by a space are pressed one after the other. */
const GROUPS = [
  {
    title: 'Global',
    rows: [
      ['c', 'Create an issue'],
      ['/', 'Search this project'],
      ['⌘ K', 'Jump to a project'],
      ['g b', 'Go to the board'],
      ['g l', 'Go to the backlog'],
      ['?', 'Show these shortcuts'],
    ],
  },
  {
    title: 'Navigation',
    rows: [
      ['j', 'Next issue'],
      ['k', 'Previous issue'],
      ['n', 'Next column or section'],
      ['p', 'Previous column or section'],
      ['Enter o', 'Open the selected issue'],
      ['Esc', 'Close the issue'],
    ],
  },
  {
    title: 'Issue actions',
    rows: [
      ['i', 'Assign to me'],
      ['a', 'Change the assignee of the open issue'],
      ['m', 'Comment on the open issue'],
      ['e', 'Edit the summary of a backlog row'],
    ],
  },
]

export const ShortcutSheet = ({ onClose }: { onClose: () => void }) => {
  const [on, setOn] = useState(shortcutsOn)
  const id = useId()
  const returnFocus = useReturnFocus()

  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent
        onCloseAutoFocus={returnFocus}
        className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl'
      >
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          Single keys work anywhere but in a field you are typing in.
        </DialogDescription>
        <div className='flex min-h-11 items-center gap-3'>
          <Switch
            id={id}
            checked={on}
            onCheckedChange={(next) => {
              setShortcutsOn(next)
              setOn(next)
            }}
          />
          <Label htmlFor={id}>Use keyboard shortcuts</Label>
        </div>
        <div className='grid gap-6 sm:grid-cols-2'>
          {GROUPS.map((group) => (
            <section key={group.title} className='grid content-start gap-2'>
              <h3 className='text-sm font-semibold'>{group.title}</h3>
              <dl className='grid gap-1.5 text-sm'>
                {group.rows.map(([keys, action]) => (
                  <div key={keys} className='flex items-center gap-3'>
                    <dt className='min-w-0 flex-1 text-muted-foreground'>
                      {action}
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
      </DialogContent>
    </Dialog>
  )
}
