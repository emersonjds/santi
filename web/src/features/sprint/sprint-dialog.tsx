import { type ReactNode, useEffect } from 'react'
import { z } from 'zod'
import {
  type FieldValues,
  type Path,
  type UseFormReturn,
  useForm,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { backlogKey } from '@/entities/issue/backlog-query'
import { boardQuery, boardsKey } from '@/entities/issue/board-query'
import { issueCount } from '@/entities/issue/labels'
import { sprintsQuery } from '@/entities/project/project-queries'
import { useTimeZone } from '@/entities/session/session-query'
import {
  ApiError,
  type Backlog,
  type BacklogSection,
  type CompleteSprint,
  type Sprint,
} from '@/shared/api/client'
import { showProblem } from '@/shared/lib/show-problem'
import { instantToZonedWallTime, zoneName } from '@/shared/lib/sprint-dates'
import { toast } from '@/shared/lib/toast'
import { useReturnFocus } from '@/shared/lib/use-return-focus'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { RootError } from '@/shared/ui/root-error'
import { Textarea } from '@/shared/ui/textarea'
import {
  useCompleteSprint,
  useCreateSprint,
  useDeleteSprint,
  useStartSprint,
  useUpdateSprint,
} from './sprint-mutations'
import {
  CUSTOM,
  PRESETS,
  customLength,
  fromInputs,
  nowToTheMinute,
  sprintWindow,
} from './sprint-window'

export type SprintAction =
  | { kind: 'create' }
  | {
      kind: 'start'
      sprint: Sprint
      section: BacklogSection
      length: string | null
    }
  // Without a section the action comes from the board, which counts from its own cards.
  | {
      kind: 'edit' | 'delete' | 'complete'
      sprint: Sprint
      section?: BacklogSection
    }

// Mirrors sprints/domain.rs; the server stays the authority.
const name = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(100, 'Use at most 100 characters.')
const goal = z.string().trim().max(1000, 'Use at most 1000 characters.')
type Moments = {
  starts_at: string
  starts_at_time: string
  ends_at: string
  ends_at_time: string
}
const startOf = (values: Moments, timeZone?: string) =>
  fromInputs(values.starts_at, values.starts_at_time, '00:00', timeZone)
const endOf = (values: Moments, timeZone?: string) =>
  fromInputs(values.ends_at, values.ends_at_time, '23:59', timeZone)
const ordered = (values: Moments) =>
  !values.starts_at ||
  !values.ends_at ||
  endOf(values, 'UTC') > startOf(values, 'UTC')
const ORDER = { message: 'End after the start.', path: ['ends_at'] }
const moments = {
  starts_at: z.string(),
  starts_at_time: z.string(),
  ends_at: z.string(),
  ends_at_time: z.string(),
}
const pairOf = (instant: string | null | undefined, timeZone?: string) =>
  instant
    ? instantToZonedWallTime(new Date(instant), timeZone)
    : { day: '', time: '' }
const MOMENT_FIELDS = ['starts_at', 'ends_at'] as const

const createSchema = z.object({
  name: z.string().trim().max(100, 'Use at most 100 characters.'),
  goal,
})
const editSchema = z.object({ name, goal, ...moments }).refine(ordered, ORDER)
const startSchema = z
  .object({
    name,
    goal,
    duration: z.string(),
    ...moments,
    starts_at: z.string().min(1, 'Pick a start date.'),
    ends_at: z.string().min(1, 'Pick an end date.'),
  })
  .refine(ordered, ORDER)

const DURATIONS = [...PRESETS, [CUSTOM, 'Custom']] as const

// IA §10: a centered dialog on wide screens, a full-screen sheet on a phone.
const SHEET =
  'max-h-[calc(100svh-2rem)] overflow-y-auto max-md:top-0 max-md:left-0 max-md:h-svh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 max-md:content-start max-md:data-[state=open]:zoom-in-100'
const FIELD = 'h-11 md:h-9'

type ShellProps = {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

const Shell = ({ title, description, onClose, children }: ShellProps) => {
  const returnFocus = useReturnFocus()
  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent
        onCloseAutoFocus={returnFocus}
        className={SHEET}
        {...(!description && { 'aria-describedby': undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

const Actions = ({
  label,
  busy,
  onClose,
  destructive,
}: {
  label: string
  busy: boolean
  onClose: () => void
  destructive?: boolean
}) => (
  <div className='flex justify-end gap-2'>
    <Button type='button' variant='ghost' className={FIELD} onClick={onClose}>
      Cancel
    </Button>
    <Button
      variant={destructive ? 'destructive' : 'default'}
      className={FIELD}
      disabled={busy}
    >
      {busy && <Loader2 className='animate-spin' />}
      {label}
    </Button>
  </div>
)

/** Field errors of a refusal (D24) on their fields, anything else above the buttons. */
const refusal =
  <Values extends FieldValues>(
    form: UseFormReturn<Values>,
    fields: readonly Path<Values>[]
  ) =>
  (error: unknown) => {
    if (!(error instanceof ApiError)) throw error
    showProblem(form.setError, fields, {
      detail: error.message,
      errors: error.errors,
    })
  }

type FormProps = { projectKey: string; onClose: () => void }

const TextField = <Values extends FieldValues>({
  form,
  name: field,
  label,
  textarea,
}: {
  form: UseFormReturn<Values>
  name: Path<Values>
  label: string
  textarea?: boolean
}) => (
  <FormField
    control={form.control}
    name={field}
    render={({ field: input }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          {textarea ? (
            <Textarea className='min-h-20' {...input} />
          ) : (
            <Input autoComplete='off' className={FIELD} {...input} />
          )}
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
)

const MomentFields = <Values extends FieldValues>({
  form,
  legend,
  fields,
  onPick,
}: {
  form: UseFormReturn<Values>
  legend: 'Start' | 'End'
  fields: readonly [date: Path<Values>, time: Path<Values>]
  onPick?: () => void
}) => (
  <fieldset>
    <legend className='mb-2 text-sm font-medium'>{`${legend}s`}</legend>
    <div className='grid gap-2 sm:grid-cols-2'>
      {fields.map((field, index) => (
        <FormField
          key={field}
          control={form.control}
          name={field}
          render={({ field: input }) => (
            <FormItem>
              <FormControl>
                <Input
                  type={index ? 'time' : 'date'}
                  aria-label={`${legend} ${index ? 'time' : 'date'}`}
                  className={FIELD}
                  {...input}
                  onChange={(event) => {
                    input.onChange(event)
                    onPick?.()
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </div>
  </fieldset>
)

const ZoneLine = ({ timeZone }: { timeZone?: string }) => (
  <p className='text-sm text-muted-foreground'>
    Times use your time zone ({zoneName(new Date(), timeZone)}).
  </p>
)

const CreateSprintForm = ({ projectKey, onClose }: FormProps) => {
  const create = useCreateSprint(projectKey)
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', goal: '' },
  })
  const submit = form.handleSubmit((values) =>
    create
      .mutateAsync({
        name: values.name || undefined,
        goal: values.goal || undefined,
      })
      .then(
        (sprint) => {
          toast.success(`${sprint.name} created`)
          onClose()
        },
        refusal(form, ['name', 'goal'])
      )
  )
  return (
    <Shell
      title='Create sprint'
      description='It lands after the other planned sprints. Leave the name empty for the next "Sprint N".'
      onClose={onClose}
    >
      <Form {...form}>
        <form onSubmit={submit} className='grid gap-4' noValidate>
          <TextField form={form} name='name' label='Name' />
          <TextField form={form} name='goal' label='Goal' textarea />
          <RootError message={form.formState.errors.root?.message} />
          <Actions
            label='Create sprint'
            busy={form.formState.isSubmitting}
            onClose={onClose}
          />
        </form>
      </Form>
    </Shell>
  )
}

type SprintFormProps = FormProps & { sprint: Sprint; section?: BacklogSection }

const EditSprintForm = ({ projectKey, sprint, onClose }: SprintFormProps) => {
  const update = useUpdateSprint(projectKey)
  const timeZone = useTimeZone()
  const starts = pairOf(sprint.starts_at, timeZone)
  const ends = pairOf(sprint.ends_at, timeZone)
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: sprint.name,
      goal: sprint.goal,
      starts_at: starts.day,
      starts_at_time: starts.time,
      ends_at: ends.day,
      ends_at_time: ends.time,
    },
  })
  const submit = form.handleSubmit((values) =>
    update
      .mutateAsync({
        id: sprint.id,
        name: values.name,
        goal: values.goal,
        starts_at: values.starts_at
          ? startOf(values, timeZone).toISOString()
          : null,
        ends_at: values.ends_at ? endOf(values, timeZone).toISOString() : null,
      })
      .then(onClose, refusal(form, ['name', 'goal', ...MOMENT_FIELDS]))
  )
  return (
    <Shell title={`Edit ${sprint.name}`} onClose={onClose}>
      <Form {...form}>
        <form onSubmit={submit} className='grid gap-4' noValidate>
          <TextField form={form} name='name' label='Name' />
          <MomentFields
            form={form}
            legend='Start'
            fields={['starts_at', 'starts_at_time']}
          />
          <MomentFields
            form={form}
            legend='End'
            fields={['ends_at', 'ends_at_time']}
          />
          <ZoneLine timeZone={timeZone} />
          <TextField form={form} name='goal' label='Goal' textarea />
          <RootError message={form.formState.errors.root?.message} />
          <Actions
            label='Save'
            busy={form.formState.isSubmitting}
            onClose={onClose}
          />
        </form>
      </Form>
    </Shell>
  )
}

const DeleteSprintForm = ({ projectKey, sprint, onClose }: SprintFormProps) => {
  const remove = useDeleteSprint(projectKey)
  const form = useForm()
  const submit = form.handleSubmit(() =>
    remove.mutateAsync(sprint.id).then(
      () => {
        toast.success(`${sprint.name} deleted`)
        onClose()
      },
      refusal(form, [])
    )
  )
  return (
    <Shell
      title={`Delete ${sprint.name}?`}
      description='Its issues go back to the backlog, in the same order.'
      onClose={onClose}
    >
      <form onSubmit={submit} className='grid gap-4'>
        <RootError message={form.formState.errors.root?.message} />
        <Actions
          label='Delete sprint'
          destructive
          busy={form.formState.isSubmitting}
          onClose={onClose}
        />
      </form>
    </Shell>
  )
}

const startDefaults = (
  sprint: Sprint,
  length: string | null,
  timeZone?: string
) => {
  const now = nowToTheMinute()
  const planned =
    sprint.ends_at && Date.parse(sprint.ends_at) > now.getTime()
      ? new Date(sprint.ends_at)
      : null
  const remembered = length ?? '2w'
  const preset = PRESETS.some(([token]) => token === remembered)
  const starts = instantToZonedWallTime(now, timeZone)
  const ends = instantToZonedWallTime(
    planned ?? sprintWindow(now, remembered, timeZone),
    timeZone
  )
  return {
    duration: planned || !preset ? CUSTOM : remembered,
    starts_at: starts.day,
    starts_at_time: starts.time,
    ends_at: ends.day,
    ends_at_time: ends.time,
  }
}

const StartSprintForm = ({
  projectKey,
  sprint,
  section,
  length,
  onClose,
}: SprintFormProps & { section: BacklogSection; length: string | null }) => {
  const start = useStartSprint(projectKey)
  const timeZone = useTimeZone()
  const form = useForm<z.infer<typeof startSchema>>({
    resolver: zodResolver(startSchema),
    defaultValues: {
      name: sprint.name,
      goal: sprint.goal,
      ...startDefaults(sprint, length, timeZone),
    },
  })
  const follow = () => {
    const values = form.getValues()
    if (values.duration === CUSTOM || !values.starts_at) return
    const end = instantToZonedWallTime(
      sprintWindow(startOf(values, timeZone), values.duration, timeZone),
      timeZone
    )
    form.setValue('ends_at', end.day)
    form.setValue('ends_at_time', end.time)
  }
  const submit = form.handleSubmit(({ duration, ...values }) => {
    const from = startOf(values, timeZone)
    const to = endOf(values, timeZone)
    return start
      .mutateAsync({
        id: sprint.id,
        name: values.name,
        goal: values.goal,
        starts_at: from.toISOString(),
        ends_at: to.toISOString(),
        length: duration === CUSTOM ? customLength(from, to) : duration,
      })
      .then(
        () => {
          toast.success(`${values.name} started`)
          onClose()
        },
        refusal(form, ['name', 'goal', ...MOMENT_FIELDS])
      )
  })
  return (
    <Shell
      title={`Start ${sprint.name}`}
      description={`${issueCount(section.issue_count)} will be on the board.`}
      onClose={onClose}
    >
      <Form {...form}>
        <form onSubmit={submit} className='grid gap-4' noValidate>
          <TextField form={form} name='name' label='Name' />
          <FormField
            control={form.control}
            name='duration'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Duration</FormLabel>
                <FormControl>
                  <NativeSelect
                    className='w-full'
                    {...field}
                    onChange={(event) => {
                      field.onChange(event)
                      follow()
                    }}
                  >
                    {DURATIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
              </FormItem>
            )}
          />
          <MomentFields
            form={form}
            legend='Start'
            fields={['starts_at', 'starts_at_time']}
            onPick={follow}
          />
          <MomentFields
            form={form}
            legend='End'
            fields={['ends_at', 'ends_at_time']}
            onPick={() => form.setValue('duration', CUSTOM)}
          />
          <ZoneLine timeZone={timeZone} />
          <TextField form={form} name='goal' label='Goal' textarea />
          <RootError message={form.formState.errors.root?.message} />
          <Actions
            label='Start sprint'
            busy={form.formState.isSubmitting}
            onClose={onClose}
          />
        </form>
      </Form>
    </Shell>
  )
}

const BACKLOG = 'backlog'
const NEW_SPRINT = 'new_sprint'

const destination = (choice: string): CompleteSprint['open_issues'] => {
  if (choice === BACKLOG) return { to: 'backlog' }
  if (choice === NEW_SPRINT) return { to: 'new_sprint' }
  return { to: 'sprint', sprint_id: Number(choice) }
}

const CompleteSprintForm = ({
  projectKey,
  sprint,
  section,
  onClose,
}: SprintFormProps) => {
  const complete = useCompleteSprint(projectKey)
  const queryClient = useQueryClient()
  // Board and backlog caches can lag a move made on the other page; count from a fresh read of both.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: backlogKey(projectKey) })
    void queryClient.invalidateQueries({ queryKey: boardsKey(projectKey) })
  }, [queryClient, projectKey])
  const counting =
    useIsFetching({ queryKey: backlogKey(projectKey) }) +
      useIsFetching({ queryKey: boardsKey(projectKey) }) >
    0
  const { data: sprints = [] } = useQuery(sprintsQuery(projectKey))
  // The board holds the sprint's done issues, which the backlog hides (BL-2).
  const { data: board } = useQuery(boardQuery(projectKey, {}))
  const done = board?.columns[board.columns.length - 1]?.cards.length
  // Parent rows only, as the backlog counts them (BL-2): subtasks follow their parent (SP-17).
  const live = queryClient
    .getQueriesData<Backlog>({ queryKey: backlogKey(projectKey) })
    .flatMap(([, backlog]) => backlog?.sections ?? [])
    .find((each) => each.sprint?.id === sprint.id)
  const open =
    (live ?? section)?.issue_count ??
    board?.columns
      .slice(0, -1)
      .flatMap((column) => column.cards)
      .filter((card) => card.issue_type !== 'subtask').length
  const futures = sprints.filter((each) => each.state === 'future')
  const form = useForm({ defaultValues: { open_issues: BACKLOG } })
  const submit = form.handleSubmit((values) =>
    complete
      .mutateAsync({
        id: sprint.id,
        open_issues: destination(values.open_issues),
      })
      .then(
        () => {
          toast.success(`${sprint.name} completed`)
          onClose()
        },
        refusal(form, [])
      )
  )
  const choices = [
    [BACKLOG, 'Backlog'],
    ...futures.map((each) => [String(each.id), each.name]),
    [NEW_SPRINT, 'A new sprint'],
  ]
  return (
    <Shell
      title={`Complete ${sprint.name}`}
      description={
        counting
          ? 'Counting issues…'
          : open === 0
            ? 'Every issue is done.'
            : `${done === undefined ? '' : `${issueCount(done)} done · `}${open ?? '…'} open`
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className='grid gap-4'>
        {/* D13: one destination for every open issue, asked only when some are open. */}
        {open !== 0 && (
          <fieldset className='grid gap-1'>
            <legend className='mb-2 text-sm font-medium'>
              Unfinished issues go to
            </legend>
            {choices.map(([value, label]) => (
              <label
                key={value}
                className='flex min-h-11 items-center gap-2 rounded-md px-2 text-sm hover:bg-hover md:min-h-9'
              >
                <input
                  type='radio'
                  value={value}
                  className='size-4 accent-primary'
                  {...form.register('open_issues')}
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <RootError message={form.formState.errors.root?.message} />
        <Actions
          label='Complete sprint'
          busy={form.formState.isSubmitting}
          onClose={onClose}
        />
      </form>
    </Shell>
  )
}

type SprintDialogProps = {
  projectKey: string
  action: SprintAction
  onClose: () => void
}

/** The sprint dialogs (lazy chunk): create, edit, delete, start, complete (SP-3 to SP-18). */
export const SprintDialog = ({
  projectKey,
  action,
  onClose,
}: SprintDialogProps) => {
  if (action.kind === 'create')
    return <CreateSprintForm projectKey={projectKey} onClose={onClose} />
  const props = { projectKey, onClose }
  if (action.kind === 'start') return <StartSprintForm {...props} {...action} />
  if (action.kind === 'edit') return <EditSprintForm {...props} {...action} />
  if (action.kind === 'delete')
    return <DeleteSprintForm {...props} {...action} />
  return <CompleteSprintForm {...props} {...action} />
}
