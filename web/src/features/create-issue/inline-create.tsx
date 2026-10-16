import { type FormEvent, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { useCreateIssue } from '@/entities/issue/issue-mutations'
import { TYPE_LABEL, isIssueType } from '@/entities/issue/labels'
import {
  type BoardView,
  type IssueType,
  fieldMessage,
} from '@/shared/api/client'
import { Input } from '@/shared/ui/input'

// SB-23: never subtasks inline; epics are made from the dialog.
const INLINE_TYPES = ['story', 'task', 'bug'] as const

type InlineCreateProps = {
  projectKey: string
  board: BoardView
  onClose: () => void
}

/** D5: summary and type at the foot of the first column; the issue takes that column's status and the running sprint. */
export const InlineCreate = ({
  projectKey,
  board,
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
    create.mutate(
      {
        summary: text,
        issue_type: type,
        sprint_id: board.sprint?.id,
        status_id: settings?.columns[0]?.statuses[0]?.id,
      },
      { onSuccess: () => setSummary('') }
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
