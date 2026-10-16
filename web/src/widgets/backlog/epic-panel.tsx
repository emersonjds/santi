import { type FormEvent, type ReactNode, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { EPIC_DROP } from '@/entities/issue/backlog-cache'
import { useCreateIssue } from '@/entities/issue/issue-mutations'
import { type Backlog, fieldMessage } from '@/shared/api/client'
import { useIsMobile } from '@/shared/lib/use-mobile'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'

type Epic = Backlog['epics'][number]

const NO_EPIC = 'none'

const ITEM =
  'grid min-h-11 content-center gap-1 rounded-md px-3 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground'

type PickProps = {
  /** The `epic` it sets: a key, `none`, or nothing for all issues. */
  value?: string
  selected?: string
  /** On a phone the sheet covers the list, so a pick closes it. */
  closes: boolean
  /** Rows dropped here take this epic; `All issues` takes none. */
  droppable: boolean
  label?: string
  children: ReactNode
}

/** One entry: selecting it filters the backlog (again clears it); dropping a row on it sets the row's epic (BL-20). */
const Pick = ({
  value,
  selected,
  closes,
  droppable,
  label,
  children,
}: PickProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `${EPIC_DROP}${value}`,
    disabled: !droppable,
  })
  const current = selected === value
  return (
    <li ref={setNodeRef}>
      <Link
        to='.'
        search={(prev) => ({
          ...prev,
          epic: current ? undefined : value,
          panel: closes ? undefined : prev.panel,
        })}
        role='button'
        aria-pressed={current}
        aria-label={label}
        className={cn(ITEM, isOver && 'ring-2 ring-primary')}
      >
        {children}
      </Link>
    </li>
  )
}

const Progress = ({ epic }: { epic: Epic }) => {
  // ponytail: done can briefly pass the count while a drop waits for its refetch.
  const done = Math.min(epic.done_child_count, epic.child_count)
  const percent = epic.child_count
    ? Math.round((done / epic.child_count) * 100)
    : 0
  return (
    <>
      <span className='text-xs text-muted-foreground tabular-nums'>
        {epic.child_count} {epic.child_count === 1 ? 'issue' : 'issues'} ·{' '}
        {done} done
      </span>
      <span
        role='progressbar'
        aria-label={`${epic.summary} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className='h-1.5 overflow-hidden rounded-full bg-muted'
      >
        <span
          className='block h-full bg-primary'
          style={{ width: `${percent}%` }}
        />
      </span>
    </>
  )
}

const CreateEpic = ({ projectKey }: { projectKey: string }) => {
  const create = useCreateIssue(projectKey)
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')

  if (!open)
    return (
      <button
        type='button'
        className='flex h-11 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:h-9'
        onClick={() => setOpen(true)}
      >
        <Plus className='size-4' />
        Create epic
      </button>
    )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = summary.trim()
    if (!text) return
    create.mutate(
      { summary: text, issue_type: 'epic' },
      { onSuccess: () => setSummary('') }
    )
  }

  return (
    <form onSubmit={submit} className='grid gap-1.5'>
      <Input
        aria-label='New epic summary'
        placeholder='Name the epic'
        autoFocus
        maxLength={255}
        className='h-11 md:h-9'
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
      />
      {create.error && (
        <p className='text-sm text-destructive'>{fieldMessage(create.error)}</p>
      )}
    </form>
  )
}

type EpicPanelProps = {
  epics: Epic[]
  projectKey: string
  /** The epic filter in the URL. */
  selected?: string
  onClose: () => void
}

/** D10, BL-20: the backlog's epics with their progress; a right rail that pushes the list, a full-screen sheet on a phone (R-7). */
export const EpicPanel = ({
  epics,
  projectKey,
  selected,
  onClose,
}: EpicPanelProps) => {
  const narrow = useIsMobile()
  const pick = { selected, closes: narrow }
  const body = (
    <div className='grid gap-2'>
      <ul className='grid gap-1'>
        <Pick {...pick} droppable={false}>
          All issues
        </Pick>
        <Pick {...pick} value={NO_EPIC} droppable>
          Issues without epic
        </Pick>
        {epics.map((epic) => (
          <Pick
            key={epic.key}
            {...pick}
            value={epic.key}
            droppable
            label={`${epic.key} ${epic.summary}`}
          >
            <span className='line-clamp-2'>
              <span className='text-xs tracking-wide text-subtle-foreground tabular-nums'>
                {epic.key}
              </span>{' '}
              {epic.summary}
            </span>
            <Progress epic={epic} />
          </Pick>
        ))}
      </ul>
      {epics.length === 0 && (
        <p className='px-3 text-sm text-muted-foreground'>No epics yet.</p>
      )}
      <CreateEpic projectKey={projectKey} />
    </div>
  )

  if (narrow)
    return (
      <Sheet open onOpenChange={(open) => open || onClose()}>
        <SheetContent
          side='right'
          className='w-full overflow-y-auto sm:max-w-none'
        >
          <SheetHeader className='pb-0'>
            <SheetTitle>Epics</SheetTitle>
            <SheetDescription className='sr-only'>
              Pick an epic to see only its issues.
            </SheetDescription>
          </SheetHeader>
          <div className='px-4 pb-4'>{body}</div>
        </SheetContent>
      </Sheet>
    )

  return (
    <aside
      aria-label='Epics'
      className='sticky top-4 max-h-[calc(100svh-2rem)] w-72 shrink-0 overflow-y-auto rounded-lg border bg-card p-2'
    >
      <h2 className='px-3 py-2 text-sm font-semibold'>Epics</h2>
      {body}
    </aside>
  )
}
