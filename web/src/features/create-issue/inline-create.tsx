import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { useCreateIssue } from '@/entities/issue/issue-mutations'
import { TYPE_LABEL, isIssueType } from '@/entities/issue/labels'
import { statusesOf } from '@/entities/issue/statuses'
import { fieldMessage } from '@/shared/api/client'
import { useHeldEditor } from '@/shared/lib/held-editor'
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

/** D5 inline create. */
export const InlineCreate = ({
  projectKey,
  sprintId,
  columnId,
  onClose,
}: InlineCreateProps) => {
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const create = useCreateIssue(projectKey)
  const held = `create:${sprintId ?? 'backlog'}:${columnId ?? ''}`
  const summary = useHeldEditor(held)
  const type = useHeldEditor(`${held}:type`)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = String(form.get('summary')).trim()
    const issueType = String(form.get('type'))
    if (!text || !isIssueType(issueType)) return
    summary.fill('')
    create.mutate(
      {
        summary: text,
        issue_type: issueType,
        sprint_id: sprintId ?? undefined,
        status_id: statusesOf(settings, columnId ?? settings?.columns[0]?.id)[0]
          ?.id,
      },
      { onError: () => summary.fill(text) }
    )
  }

  return (
    <form onSubmit={submit} className='grid gap-1.5 px-2 pb-2'>
      <div className='flex gap-1.5'>
        <select
          name='type'
          aria-label='New issue type'
          className='h-11 rounded-md border border-input bg-background px-1 text-base md:h-9 md:text-sm'
          defaultValue='story'
          {...type.field}
          autoFocus={false}
        >
          {INLINE_TYPES.map((value) => (
            <option key={value} value={value}>
              {TYPE_LABEL[value]}
            </option>
          ))}
        </select>
        <Input
          name='summary'
          aria-label='New issue summary'
          placeholder='What needs doing?'
          maxLength={255}
          className='h-11 bg-background md:h-9'
          {...summary.field}
          onKeyDown={(event) => event.key === 'Escape' && onClose()}
        />
      </div>
      {create.error && (
        <p className='text-sm text-destructive'>{fieldMessage(create.error)}</p>
      )}
    </form>
  )
}
