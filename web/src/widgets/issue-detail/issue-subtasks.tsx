import { type FormEvent, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2, Plus } from 'lucide-react'
import { RowAssignee, RowPriority } from '@/features/edit-row/row-fields'
import { cardOf } from '@/entities/issue/board-cache'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { useOfferToFinishParent } from '@/entities/issue/finish-parent'
import { PriorityGlyph, TypeGlyph } from '@/entities/issue/issue-glyphs'
import {
  useCreateIssue,
  useMoveSubtask,
  useUpdateSubtask,
} from '@/entities/issue/issue-mutations'
import { subtasksQuery } from '@/entities/issue/issue-queries'
import { CATEGORY, statusesById } from '@/entities/issue/statuses'
import { AssigneeAvatar } from '@/entities/user/user-avatar'
import {
  type BoardSettings,
  type Issue,
  fieldMessage,
} from '@/shared/api/client'
import { useReadOnly } from '@/shared/lib/read-only'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'

type SubtaskRowProps = {
  subtask: Issue
  subtasks: Issue[]
  parentKey: string
  projectKey: string
  settings?: BoardSettings
  onStatusMoved: (from: number, subtasksAfter: Issue[]) => void
}

/** SAN-156: one line on wide screens; on a phone the controls take a second line. */
const SubtaskRow = ({
  subtask,
  subtasks,
  parentKey,
  projectKey,
  settings,
  onStatusMoved,
}: SubtaskRowProps) => {
  const move = useMoveSubtask(projectKey, parentKey)
  const update = useUpdateSubtask(projectKey, parentKey)
  const locked = useReadOnly() !== undefined
  const category = statusesById(settings).get(subtask.status_id)?.category
  const card = {
    ...cardOf(subtask, 0),
    assignee_name: subtask.assignee_name ?? null,
  }
  const fields = { card, projectKey, useUpdate: () => update }

  const changeStatus = (status_id: number) => {
    const after = subtasks.map((each) =>
      each.key === subtask.key ? { ...each, status_id } : each
    )
    move.mutate(
      { subtask, status_id },
      { onSuccess: () => onStatusMoved(subtask.status_id, after) }
    )
  }

  return (
    <li className='grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-3 py-2 text-sm transition-colors duration-150 hover:bg-hover md:flex md:min-h-11 md:py-1'>
      <TypeGlyph type={subtask.issue_type} />
      <span className='whitespace-nowrap text-subtle-foreground tabular-nums'>
        {subtask.key}
      </span>
      <Link
        to='/p/$key/issues/$number'
        params={{ key: projectKey, number: String(subtask.number) }}
        title={subtask.summary}
        className='min-w-0 flex-1 truncate hover:underline'
      >
        {subtask.summary}
      </Link>
      <span className='col-span-3 flex min-w-0 items-center gap-2 md:contents'>
        <span className='relative min-w-0'>
          <NativeSelect
            aria-label={`Status of ${subtask.key}`}
            aria-busy={move.isPending}
            className={cn(
              'max-w-48 border-transparent font-semibold md:h-8',
              category ? CATEGORY[category].tone : 'bg-muted'
            )}
            value={subtask.status_id}
            onChange={(event) => changeStatus(Number(event.target.value))}
          >
            {settings?.columns.map((column) => (
              <optgroup key={column.id} label={column.name}>
                {column.statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
          {move.isPending && (
            <Loader2
              aria-hidden='true'
              className='pointer-events-none absolute end-1.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin'
            />
          )}
        </span>
        {locked ? (
          <PriorityGlyph priority={subtask.priority} />
        ) : (
          <RowPriority {...fields} />
        )}
        {locked ? (
          subtask.assignee_name && (
            <AssigneeAvatar name={subtask.assignee_name} />
          )
        ) : (
          <RowAssignee {...fields} />
        )}
      </span>
    </li>
  )
}

type IssueSubtasksProps = { issue: Issue; projectKey: string }

/** D6: subtasks hang under stories, tasks and bugs, and are added here, never inline on the board. */
export const IssueSubtasks = ({ issue, projectKey }: IssueSubtasksProps) => {
  const { data: subtasks = [] } = useQuery(subtasksQuery(projectKey, issue.key))
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const create = useCreateIssue(projectKey)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const statuses = statusesById(settings)
  const offerToFinish = useOfferToFinishParent(projectKey)
  const done = subtasks.filter(
    (subtask) => statuses.get(subtask.status_id)?.category === 'done'
  ).length

  const cancel = () => {
    setAdding(false)
    setDraft('')
    create.reset()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const summary = draft.trim()
    if (!summary) return
    setDraft('')
    create.mutate(
      { summary, issue_type: 'subtask', parent: issue.key },
      { onError: () => setDraft(summary) }
    )
  }

  return (
    <section aria-labelledby='issue-subtasks' className='grid gap-2'>
      <h3 id='issue-subtasks' className='text-sm font-semibold'>
        Subtasks
        {subtasks.length > 0 && (
          <span className='font-normal text-muted-foreground'>
            {` · ${done} of ${subtasks.length} done`}
          </span>
        )}
      </h3>
      {subtasks.length > 0 && (
        <div
          role='progressbar'
          aria-labelledby='issue-subtasks'
          aria-valuemin={0}
          aria-valuemax={subtasks.length}
          aria-valuenow={done}
          className='h-1 overflow-hidden rounded-full bg-muted'
        >
          <div
            className='h-full rounded-full bg-status-done'
            style={{ width: `${(done / subtasks.length) * 100}%` }}
          />
        </div>
      )}
      <ul className='grid grid-cols-1 divide-y rounded-md border empty:hidden'>
        {subtasks.map((subtask) => (
          <SubtaskRow
            key={subtask.key}
            subtask={subtask}
            subtasks={subtasks}
            parentKey={issue.key}
            projectKey={projectKey}
            settings={settings}
            onStatusMoved={(from, after) =>
              void offerToFinish(issue.key, from, after)
            }
          />
        ))}
      </ul>
      {adding ? (
        <form onSubmit={submit} className='grid gap-1.5'>
          <div className='flex gap-1.5'>
            <Input
              aria-label='Subtask summary'
              placeholder='What needs doing?'
              autoFocus
              maxLength={255}
              className='h-11 md:h-9'
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && cancel()}
              data-own-escape
            />
            <Button
              type='button'
              variant='ghost'
              className='h-11 md:h-9'
              onClick={cancel}
            >
              Cancel
            </Button>
          </div>
          {create.error && (
            <p className='text-sm text-destructive'>
              {fieldMessage(create.error)}
            </p>
          )}
        </form>
      ) : (
        <Button
          variant='ghost'
          className='h-11 justify-self-start md:h-9'
          onClick={() => setAdding(true)}
        >
          <Plus />
          Add subtask
        </Button>
      )}
    </section>
  )
}
