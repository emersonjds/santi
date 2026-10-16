import { type ReactNode, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import {
  type IssueChange,
  useEditIssue,
} from '@/entities/issue/issue-mutations'
import {
  PRIORITY_LABEL,
  TYPE_LABEL,
  isIssueType,
  isPriority,
} from '@/entities/issue/labels'
import { timeAgo } from '@/entities/issue/time-ago'
import {
  membersQuery,
  projectQuery,
  sprintsQuery,
} from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import { type Issue, fieldMessage } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { CommitInput } from './commit-input'

// Native selects: no menu chunk to load, the phone's own picker, 44px rows on touch (ui-layout).
const SELECT =
  'h-11 w-full rounded-md border border-input bg-background px-2 text-base md:h-9 md:text-sm'

type Save = (change: IssueChange['change'], shown: IssueChange['shown']) => void

type FieldProps = {
  label: string
  issue: Issue
  projectKey: string
  children: (save: Save, id: string) => ReactNode
}

/** One editable detail: its own write, so a refusal shows next to the field that caused it. */
const Field = ({ label, issue, projectKey, children }: FieldProps) => {
  const edit = useEditIssue(projectKey, issue)
  const id = useId()
  return (
    <div className='grid gap-1.5'>
      <label htmlFor={id} className='text-xs font-medium text-muted-foreground'>
        {label}
      </label>
      {children((change, shown) => edit.mutate({ change, shown }), id)}
      {edit.error && (
        <p className='text-sm text-destructive'>{fieldMessage(edit.error)}</p>
      )}
    </div>
  )
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='grid gap-0.5'>
    <span className='text-xs font-medium text-muted-foreground'>{label}</span>
    <span className='text-sm'>{children}</span>
  </div>
)

const When = ({ iso }: { iso: string }) => (
  <time dateTime={iso} title={new Date(iso).toLocaleString()}>
    {timeAgo(iso)}
  </time>
)

type IssueFieldsProps = { issue: Issue; projectKey: string }

const StatusField = ({ issue, projectKey }: IssueFieldsProps) => {
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  return (
    <Field label='Status' issue={issue} projectKey={projectKey}>
      {(save, id) => (
        <select
          id={id}
          className={SELECT}
          value={issue.status_id}
          onChange={(event) => {
            const status_id = Number(event.target.value)
            save({ status_id }, { status_id })
          }}
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
        </select>
      )}
    </Field>
  )
}

const UNASSIGNED = ''

const AssigneeField = ({ issue, projectKey }: IssueFieldsProps) => {
  const { data: members = [] } = useQuery(membersQuery(projectKey))
  const { data: me } = useQuery(sessionQuery)
  const nameOf = (userId: number | null) =>
    members.find((member) => member.user_id === userId)?.display_name ?? null

  return (
    <Field label='Assignee' issue={issue} projectKey={projectKey}>
      {(save, id) => {
        const assign = (assignee_id: number | null) =>
          save(
            { assignee_id },
            { assignee_id, assignee_name: nameOf(assignee_id) }
          )
        return (
          <>
            <select
              id={id}
              className={SELECT}
              value={issue.assignee_id ?? UNASSIGNED}
              onChange={(event) =>
                assign(
                  event.target.value === UNASSIGNED
                    ? null
                    : Number(event.target.value)
                )
              }
            >
              <option value={UNASSIGNED}>Unassigned</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
            </select>
            {me && issue.assignee_id !== me.id && (
              <Button
                variant='link'
                className='h-11 justify-self-start px-0 md:h-7'
                onClick={() => assign(me.id)}
              >
                Assign to me
              </Button>
            )}
          </>
        )
      }}
    </Field>
  )
}

const SprintField = ({ issue, projectKey }: IssueFieldsProps) => {
  const { data: sprints = [] } = useQuery(sprintsQuery(projectKey))
  const choices = sprints.filter(
    (sprint) => sprint.state !== 'closed' || sprint.id === issue.sprint_id
  )
  return (
    <Field label='Sprint' issue={issue} projectKey={projectKey}>
      {(save, id) => (
        <select
          id={id}
          className={SELECT}
          value={issue.sprint_id ?? ''}
          onChange={(event) => {
            const sprint_id = Number(event.target.value) || null
            save({ sprint_id }, { sprint_id })
          }}
        >
          <option value=''>Backlog</option>
          {choices.map((sprint) => (
            <option key={sprint.id} value={sprint.id}>
              {sprint.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

const pointsOf = (text: string) => (text === '' ? null : Number(text))

/** The right column of the issue view (UI-27): every field saves on change. */
export const IssueFields = ({ issue, projectKey }: IssueFieldsProps) => {
  const { data: project } = useQuery(projectQuery(projectKey))
  const { data: members = [] } = useQuery(membersQuery(projectKey))
  const reporter = members.find(
    (member) => member.user_id === issue.reporter_id
  )
  const field = { issue, projectKey }

  return (
    <section
      aria-labelledby='issue-details'
      className='grid content-start gap-4 md:border-s md:ps-6'
    >
      <h3 id='issue-details' className='text-sm font-semibold'>
        Details
      </h3>
      <StatusField {...field} />
      <AssigneeField {...field} />
      <Fact label='Reporter'>{reporter?.display_name ?? 'Former member'}</Fact>
      <Field label='Priority' {...field}>
        {(save, id) => (
          <select
            id={id}
            className={SELECT}
            value={issue.priority}
            onChange={(event) => {
              const priority = event.target.value
              if (isPriority(priority)) save({ priority }, { priority })
            }}
          >
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label='Type' {...field}>
        {(save, id) => (
          <select
            id={id}
            className={SELECT}
            value={issue.issue_type}
            onChange={(event) => {
              const issue_type = event.target.value
              if (isIssueType(issue_type)) save({ issue_type }, { issue_type })
            }}
          >
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label='Points' {...field}>
        {(save, id) => (
          <CommitInput
            id={id}
            type='number'
            min={0}
            step='any'
            inputMode='decimal'
            className='h-11 md:h-9'
            value={issue.points == null ? '' : String(issue.points)}
            onCommit={(text) => {
              const points = pointsOf(text)
              save({ points }, { points })
            }}
          />
        )}
      </Field>
      {project?.board_type === 'scrum' && <SprintField {...field} />}
      <Field label='Labels' {...field}>
        {(save, id) => (
          <CommitInput
            id={id}
            className='h-11 md:h-9'
            placeholder='Words separated by spaces'
            value={issue.labels.join(' ')}
            onCommit={(text) => {
              const labels = text.split(/[\s,]+/).filter(Boolean)
              save({ labels }, { labels })
            }}
          />
        )}
      </Field>
      <Field label='Parent' {...field}>
        {(save, id) => (
          <CommitInput
            id={id}
            className='h-11 font-mono md:h-9'
            placeholder='None'
            value={issue.parent_key ?? ''}
            onCommit={(text) => {
              const parent = text.toUpperCase() || null
              save({ parent }, { parent_key: parent })
            }}
          />
        )}
      </Field>
      <Fact label='Created'>
        <When iso={issue.created_at} />
      </Fact>
      <Fact label='Updated'>
        <When iso={issue.updated_at} />
      </Fact>
    </section>
  )
}
