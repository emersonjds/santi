import { type FormEvent, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { useCreateIssue } from '@/entities/issue/issue-mutations'
import { TYPE_LABEL, isIssueType } from '@/entities/issue/labels'
import { statusesOf } from '@/entities/issue/statuses'
import { type IssueType, fieldMessage } from '@/shared/api/client'
import { Input } from '@/shared/ui/input'

// SB-23: never subtasks inline; epics are made from the dialog.
const INLINE_TYPES = ['story', 'task', 'bug'] as const

type InlineCreateProps = {
  projectKey: string
  /** The sprint the issue lands in; none for the backlog (or a kanban board). */
  sprintId?: number | null
  /** The board column it lands in; the backlog takes the first column. */
  columnId?: number
  onClose: () => void
}

/** D5: summary and type at the foot of a column or a backlog section; the issue takes the column's first status and that sprint. */
export const InlineCreate = ({
  projectKey,
  sprintId,
  columnId,
  onClose,
}: InlineCreateProps) => {
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const create = useCreateIssue(projectKey)
  const [summary, setSummary] = useState('')
  const [type, setType] = useState<IssueType>('story')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = summary.trim()
    if (!text) return
    setSummary('')
    create.mutate(
      {
        summary: text,
        issue_type: type,
        sprint_id: sprintId ?? undefined,
        status_id: statusesOf(settings, columnId ?? settings?.columns[0]?.id)[0]
          ?.id,
      },
      { onError: () => setSummary(text) }
    )
  }

  return (
    <form onSubmit={submit} className='grid gap-1.5 px-2 pb-2'>
      <div className='flex gap-1.5'>
        <select
          aria-label='New issue type'
          className='h-11 rounded-md border border-input bg-background px-1 text-base md:h-9 md:text-sm'
          value={type}
          onChange={(event) =>
            isIssueType(event.target.value) && setType(event.target.value)
          }
        >
          {INLINE_TYPES.map((value) => (
            <option key={value} value={value}>
              {TYPE_LABEL[value]}
            </option>
          ))}
        </select>
        <Input
          aria-label='New issue summary'
          placeholder='What needs doing?'
          autoFocus
          maxLength={255}
          className='h-11 bg-background md:h-9'
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && onClose()}
        />
      </div>
      {create.error && (
        <p className='text-sm text-destructive'>{fieldMessage(create.error)}</p>
      )}
    </form>
  )
}
