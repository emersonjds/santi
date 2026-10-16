import { type ReactNode, use } from 'react'
import { z } from 'zod'
import {
  type FieldValues,
  type Path,
  type UseFormReturn,
  useForm,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { BacklogContext } from '@/entities/issue/board-context'
import { boardQuery } from '@/entities/issue/board-query'
import { issueCount } from '@/entities/issue/labels'
import {
  ApiError,
  type BacklogSection,
  type CompleteSprint,
  type Sprint,
} from '@/shared/api/client'
import { showProblem } from '@/shared/lib/show-problem'
import { toast } from '@/shared/lib/toast'
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
import { RootError } from '@/shared/ui/root-error'
import { Textarea } from '@/shared/ui/textarea'
import {
  useCompleteSprint,
  useCreateSprint,
  useDeleteSprint,
  useStartSprint,
  useUpdateSprint,
} from './sprint-mutations'

export type SprintAction =
  | { kind: 'create' }
  | {
      kind: 'edit' | 'delete' | 'start' | 'complete'
      sprint: Sprint
      section: BacklogSection
    }

const DAY = 86_400_000
// Swedish dates read YYYY-MM-DD in local time, like the server's sprint dates.
const today = () => new Date().toLocaleDateString('sv')
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00`) + days * DAY).toLocaleDateString('sv')

// Mirrors sprints/domain.rs; the server stays the authority.
const name = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(100, 'Use at most 100 characters.')
const goal = z.string().trim().max(1000, 'Use at most 1000 characters.')
const ordered = (dates: { start_date: string; end_date: string }) =>
  !dates.start_date || !dates.end_date || dates.end_date >= dates.start_date
const ORDER = { message: 'End on or after the start date.', path: ['end_date'] }

const createSchema = z.object({
  name: z.string().trim().max(100, 'Use at most 100 characters.'),
  goal,
})
const editSchema = z
  .object({ name, goal, start_date: z.string(), end_date: z.string() })
  .refine(ordered, ORDER)
const startSchema = z
  .object({
    name,
    goal,
    duration: z.string(),
    start_date: z.string().min(1, 'Pick a start date.'),
    end_date: z.string().min(1, 'Pick an end date.'),
  })
  .refine(ordered, ORDER)

// D12: presets of 1 to 4 weeks, 2 by default, or any end date.
const DURATIONS = [
  ['1', '1 week'],
  ['2', '2 weeks'],
  ['3', '3 weeks'],
  ['4', '4 weeks'],
  ['custom', 'Custom'],
] as const

// IA §10: a centered dialog on wide screens, a full-screen sheet on a phone.
const SHEET =
  'max-h-[calc(100svh-2rem)] overflow-y-auto max-md:top-0 max-md:left-0 max-md:h-svh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 max-md:data-[state=open]:zoom-in-100'
const FIELD = 'h-11 md:h-9'
const SELECT =
  'h-11 w-full rounded-md border border-input bg-background px-2 text-base md:h-9 md:text-sm'

type ShellProps = {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

const Shell = ({ title, description, onClose, children }: ShellProps) => (
  <Dialog open onOpenChange={(open) => open || onClose()}>
    <DialogContent
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
  type = 'text',
  onPick,
}: {
  form: UseFormReturn<Values>
  name: Path<Values>
  label: string
  type?: 'text' | 'date' | 'textarea'
  onPick?: (value: string) => void
}) => (
  <FormField
    control={form.control}
    name={field}
    render={({ field: input }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          {type === 'textarea' ? (
            <Textarea className='min-h-20' {...input} />
          ) : (
            <Input
              type={type}
              autoComplete='off'
              className={FIELD}
              {...input}
              onChange={(event) => {
                input.onChange(event)
                onPick?.(event.target.value)
              }}
            />
          )}
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
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
          <TextField form={form} name='goal' label='Goal' type='textarea' />
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

type SprintFormProps = FormProps & { sprint: Sprint; section: BacklogSection }

const EditSprintForm = ({ projectKey, sprint, onClose }: SprintFormProps) => {
  const update = useUpdateSprint(projectKey)
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: sprint.name,
      goal: sprint.goal,
      start_date: sprint.start_date ?? '',
      end_date: sprint.end_date ?? '',
    },
  })
  const submit = form.handleSubmit((values) =>
    update
      .mutateAsync({
        id: sprint.id,
        ...values,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
      })
      .then(onClose, refusal(form, ['name', 'goal', 'start_date', 'end_date']))
  )
  return (
    <Shell title={`Edit ${sprint.name}`} onClose={onClose}>
      <Form {...form}>
        <form onSubmit={submit} className='grid gap-4' noValidate>
          <TextField form={form} name='name' label='Name' />
          <div className='grid gap-4 sm:grid-cols-2'>
            <TextField
              form={form}
              name='start_date'
              label='Starts'
              type='date'
            />
            <TextField form={form} name='end_date' label='Ends' type='date' />
          </div>
          <TextField form={form} name='goal' label='Goal' type='textarea' />
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

const StartSprintForm = ({
  projectKey,
  sprint,
  section,
  onClose,
}: SprintFormProps) => {
  const start = useStartSprint(projectKey)
  const startDate = sprint.start_date ?? today()
  const form = useForm<z.infer<typeof startSchema>>({
    resolver: zodResolver(startSchema),
    defaultValues: {
      name: sprint.name,
      goal: sprint.goal,
      duration: sprint.end_date ? 'custom' : '2',
      start_date: startDate,
      end_date: sprint.end_date ?? addDays(startDate, 14),
    },
  })
  const follow = (from: string, duration: string) => {
    if (duration === 'custom' || !from) return
    form.setValue('end_date', addDays(from, Number(duration) * 7))
  }
  const submit = form.handleSubmit(({ duration: _, ...values }) =>
    start.mutateAsync({ id: sprint.id, ...values }).then(
      () => {
        toast.success(`${values.name} started`)
        onClose()
      },
      refusal(form, ['name', 'goal', 'start_date', 'end_date'])
    )
  )
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
                  <select
                    className={SELECT}
                    {...field}
                    onChange={(event) => {
                      field.onChange(event)
                      follow(form.getValues('start_date'), event.target.value)
                    }}
                  >
                    {DURATIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormControl>
              </FormItem>
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <TextField
              form={form}
              name='start_date'
              label='Starts'
              type='date'
              onPick={(value) => follow(value, form.getValues('duration'))}
            />
            <TextField
              form={form}
              name='end_date'
              label='Ends'
              type='date'
              onPick={() => form.setValue('duration', 'custom')}
            />
          </div>
          <TextField form={form} name='goal' label='Goal' type='textarea' />
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
  const backlog = use(BacklogContext)
  // The board holds the sprint's done issues, which the backlog hides (BL-2).
  const { data: board } = useQuery(boardQuery(projectKey, {}))
  const done = board?.columns[board.columns.length - 1]?.cards.length
  const open = section.issue_count
  const futures = (backlog?.sections ?? []).flatMap(({ sprint: each }) =>
    each?.state === 'future' ? [each] : []
  )
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
        open === 0
          ? 'Every issue is done.'
          : `${done === undefined ? '' : `${issueCount(done)} done · `}${open} open`
      }
      onClose={onClose}
    >
      <form onSubmit={submit} className='grid gap-4'>
        {/* D13: one destination for every open issue, asked only when some are open. */}
        {open > 0 && (
          <fieldset className='grid gap-1'>
            <legend className='mb-2 text-sm font-medium'>
              Unfinished issues go to
            </legend>
            {choices.map(([value, label]) => (
              <label
                key={value}
                className='flex min-h-11 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted md:min-h-9'
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
  const props = { projectKey, onClose, ...action }
  if (action.kind === 'edit') return <EditSprintForm {...props} />
  if (action.kind === 'delete') return <DeleteSprintForm {...props} />
  if (action.kind === 'start') return <StartSprintForm {...props} />
  return <CompleteSprintForm {...props} />
}
