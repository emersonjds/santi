import { type FormEvent, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { TypeGlyph } from '@/entities/issue/issue-glyphs'
import { useCreateIssue } from '@/entities/issue/issue-mutations'
import { subtasksQuery } from '@/entities/issue/issue-queries'
import { StatusPill } from '@/entities/issue/status-pill'
import { type Status, statusesById } from '@/entities/issue/statuses'
import { type Issue, fieldMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const SubtaskStatus = ({ status }: { status?: Status }) =>
  status && <StatusPill status={status} />

type IssueSubtasksProps = { issue: Issue; projectKey: string }

/** D6: subtasks hang under stories, tasks and bugs, and are added here, never inline on the board. */
export const IssueSubtasks = ({ issue, projectKey }: IssueSubtasksProps) => {
  const { data: subtasks = [] } = useQuery(subtasksQuery(projectKey, issue.key))
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const create = useCreateIssue(projectKey)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const statuses = statusesById(settings)

  const cancel = () => {
    setAdding(false)
    setDraft('')
    create.reset()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const summary = draft.trim()
    if (!summary) return
    create.mutate(
      { summary, issue_type: 'subtask', parent: issue.key },
      { onSuccess: () => setDraft('') }
    )
  }

  return (
    <section aria-labelledby='issue-subtasks' className='grid gap-2'>
      <h3 id='issue-subtasks' className='text-sm font-semibold'>
        Subtasks
      </h3>
      <ul className='grid divide-y rounded-md border empty:hidden'>
        {subtasks.map((subtask) => (
          <li
            key={subtask.key}
            className='flex min-h-11 items-center gap-2 px-3 text-sm transition-colors duration-150 hover:bg-hover'
          >
            <TypeGlyph type={subtask.issue_type} />
            <span className='text-subtle-foreground tabular-nums'>
              {subtask.key}
            </span>
            <Link
              to='/p/$key/issues/$number'
              params={{ key: projectKey, number: String(subtask.number) }}
              className='min-w-0 flex-1 truncate hover:underline'
            >
              {subtask.summary}
            </Link>
            <SubtaskStatus status={statuses.get(subtask.status_id)} />
          </li>
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
