import type { ReactNode } from 'react'
import { z } from 'zod'
import { type FieldPath, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { TYPE_LABEL, issueCount } from '@/entities/issue/labels'
import { CATEGORY } from '@/entities/issue/statuses'
import { IMPORT_SOURCE_LABEL } from '@/entities/project/labels'
import { membersQuery } from '@/entities/project/project-queries'
import {
  type ImportMapping,
  type ImportPreview,
  type ImportResult,
  type IssueType,
  type SprintAction,
  api,
  formData,
} from '@/shared/api/client'
import { LongRows } from '@/shared/lib/long-rows'
import { Button } from '@/shared/ui/button'
import { NativeSelect } from '@/shared/ui/native-select'
import { RootError } from '@/shared/ui/root-error'
import { ProblemRows } from './problem-rows'

const TYPES = ['story', 'task', 'bug', 'epic', 'subtask'] as const
const SPRINT_ACTIONS = ['future', 'closed', 'skip'] as const
const SPRINT_LABEL = {
  future: 'Planned sprint',
  closed: 'Closed sprint',
  skip: 'Leave out',
} satisfies Record<SprintAction, string>

// One entry per name of the preview, in its order: names may hold dots, which form paths read as nesting.
const schema = z.object({
  statuses: z.array(z.string().min(1, 'Pick a status.')),
  people: z.array(z.string()),
  sprints: z.array(z.enum(SPRINT_ACTIONS)),
  types: z.array(z.enum(TYPES)),
})

type Mapping = z.infer<typeof schema>
type Kind = keyof Mapping

const KINDS = ['statuses', 'people', 'sprints', 'types'] as const

const countOf = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`

const named = <Value,>(names: { name: string }[], values: Value[]) =>
  Object.fromEntries(names.map(({ name }, index) => [name, values[index]]))

type Row = { name: string; index: number; meta: string }

const rowsOf = (found: { name: string; count: number }[]) =>
  found.map(({ name, count }, index) => ({
    name,
    index,
    meta: issueCount(count),
  }))

type MappingStepProps = {
  projectKey: string
  kanban: boolean
  file: File
  preview: ImportPreview
  onBack: () => void
  onDone: (result: ImportResult) => void
}

/** Step 2: what each status, person, sprint and type of the file becomes; prefilled from the preview. */
export const MappingStep = ({
  projectKey,
  kanban,
  file,
  preview,
  onBack,
  onDone,
}: MappingStepProps) => {
  const queryClient = useQueryClient()
  const { data: settings } = useSuspenseQuery(boardSettingsQuery(projectKey))
  const { data: members } = useSuspenseQuery(membersQuery(projectKey))
  const statuses = [
    ...settings.columns.flatMap((column) => column.statuses),
    ...settings.unmapped,
  ]
  const form = useForm<Mapping>({
    resolver: zodResolver(schema),
    defaultValues: {
      statuses: preview.statuses.map((status) =>
        String(status.suggested_status_id ?? '')
      ),
      people: preview.people.map((person) => String(person.member_id ?? '')),
      sprints: preview.sprints.map((sprint) =>
        sprint.closed ? 'closed' : 'future'
      ),
      types: preview.issue_types.map((type) => type.suggested),
    },
  })
  const { errors, isSubmitting } = form.formState
  const types = form.watch('types')
  const created = (wanted: (type: IssueType) => boolean) =>
    preview.issue_types.reduce(
      (sum, found, index) => sum + (wanted(types[index]) ? found.count : 0),
      0
    )

  const send = async (values: Mapping) => {
    const mapping: ImportMapping = {
      statuses: named(preview.statuses, values.statuses.map(Number)),
      people: named(
        preview.people,
        values.people.map((id) => (id ? Number(id) : null))
      ),
      sprints: kanban ? {} : named(preview.sprints, values.sprints),
      types: named(preview.issue_types, values.types),
    }
    const { data, error } = await api.POST('/api/projects/{key}/imports', {
      params: { path: { key: projectKey } },
      body: { file: file.name, mapping },
      bodySerializer: () => formData(file, { mapping }),
    })
    if (data) {
      await queryClient.invalidateQueries({
        queryKey: ['projects', projectKey],
      })
      return onDone(data)
    }
    const found: Record<Kind, { name: string }[]> = {
      statuses: preview.statuses,
      people: preview.people,
      sprints: preview.sprints,
      types: preview.issue_types,
    }
    let onRow = false
    for (const refused of error.errors ?? []) {
      for (const kind of KINDS) {
        const prefix = `mapping.${kind}.`
        if (!refused.field.startsWith(prefix)) continue
        const index = found[kind].findIndex(
          ({ name }) => name === refused.field.slice(prefix.length)
        )
        if (index < 0) continue
        form.setError(`${kind}.${index}`, { message: refused.message })
        onRow = true
      }
    }
    if (!onRow) form.setError('root', { message: error.detail })
  }

  const select = (kind: Kind, row: Row, label: string, options: ReactNode) => {
    const path: FieldPath<Mapping> = `${kind}.${row.index}`
    const message = errors[kind]?.[row.index]?.message
    return (
      <div className='grid gap-1 bg-card px-3 py-2 sm:grid-cols-[1fr_14rem] sm:items-center sm:gap-3'>
        <span className='grid min-w-0'>
          <span className='truncate font-medium'>{row.name}</span>
          <span className='text-xs text-subtle-foreground'>{row.meta}</span>
        </span>
        <NativeSelect
          aria-label={`${label}${row.name}`}
          aria-invalid={message ? true : undefined}
          {...form.register(path)}
        >
          {options}
        </NativeSelect>
        {message && (
          <p className='text-sm text-destructive sm:col-span-2'>{message}</p>
        )}
      </div>
    )
  }

  const section = (
    title: string,
    rows: Row[],
    renderRow: (row: Row) => ReactNode,
    hint?: string
  ) =>
    rows.length > 0 && (
      <section className='grid gap-2'>
        <h4 className='text-sm font-semibold'>{title}</h4>
        {hint && <p className='text-sm text-muted-foreground'>{hint}</p>}
        <ul
          aria-label={title}
          className='grid gap-px overflow-hidden rounded-md border bg-border'
        >
          <LongRows
            items={rows}
            itemKey={(row) => row.name}
            renderItem={renderRow}
          />
        </ul>
      </section>
    )

  const epics = created((type) => type === 'epic')
  const subtasks = created((type) => type === 'subtask')
  const issues = created((type) => type !== 'epic' && type !== 'subtask')

  return (
    <form onSubmit={form.handleSubmit(send)} className='grid gap-6' noValidate>
      <div className='grid gap-1'>
        <h3 className='font-semibold'>Review the mapping</h3>
        <p className='text-muted-foreground'>
          {IMPORT_SOURCE_LABEL[preview.source]} export,{' '}
          {countOf(preview.row_count, 'row')}.
        </p>
      </div>
      {section(
        'Statuses',
        preview.statuses.map((status, index) => ({
          name: status.name,
          index,
          meta: `${issueCount(status.count)} · ${CATEGORY[status.category].label}`,
        })),
        (row) =>
          select(
            'statuses',
            row,
            'Status for ',
            <>
              <option value=''>Pick a status</option>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </>
          )
      )}
      {section(
        'People',
        rowsOf(preview.people),
        (row) =>
          select(
            'people',
            row,
            'Member for ',
            <>
              <option value=''>Nobody</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
            </>
          ),
        'Matched by email. Unmatched people leave their issues unassigned.'
      )}
      {!kanban &&
        section(
          'Sprints',
          rowsOf(preview.sprints),
          (row) =>
            select(
              'sprints',
              row,
              '',
              SPRINT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {SPRINT_LABEL[action]}
                </option>
              ))
            ),
          'A closed sprint keeps its done issues; the rest go to the backlog.'
        )}
      {section('Types', rowsOf(preview.issue_types), (row) =>
        select(
          'types',
          row,
          'Type for ',
          TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))
        )
      )}
      <ProblemRows problems={preview.problems} />
      <p className='text-sm'>
        {issueCount(issues)}, {countOf(epics, 'epic')} and{' '}
        {countOf(subtasks, 'subtask')} will be created. Rows imported before
        from the same export are skipped.
      </p>
      <RootError message={errors.root?.message} />
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          className='h-11 md:h-9'
          onClick={onBack}
          disabled={isSubmitting}
        >
          Choose another file
        </Button>
        <Button type='submit' className='h-11 md:h-9' disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className='size-4 animate-spin' aria-hidden='true' />
          )}
          {isSubmitting ? 'Importing…' : 'Import'}
        </Button>
      </div>
    </form>
  )
}
