import { type ReactNode, useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateIssue } from '@/entities/issue/issue-mutations'
import { PRIORITY_LABEL, TYPE_LABEL } from '@/entities/issue/labels'
import {
  membersQuery,
  projectsQuery,
  sprintsQuery,
} from '@/entities/project/project-queries'
import { ApiError, type CreateIssue } from '@/shared/api/client'
import { showProblem } from '@/shared/lib/show-problem'
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
import { Label } from '@/shared/ui/label'
import { RootError } from '@/shared/ui/root-error'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'

// Mirrors issues/domain.rs; the server stays the authority.
const schema = z.object({
  project: z.string(),
  issue_type: z.enum(['story', 'task', 'bug', 'epic', 'subtask']),
  summary: z
    .string()
    .trim()
    .min(1, 'Enter a summary.')
    .max(255, 'Use at most 255 characters.'),
  description: z.string(),
  assignee_id: z.string(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']),
  points: z
    .string()
    .refine((text) => text === '' || Number(text) >= 0, 'Use zero or more.'),
  sprint_id: z.string(),
  parent: z.string().trim(),
})

type NewIssue = z.infer<typeof schema>

const FIELDS = [
  'issue_type',
  'summary',
  'description',
  'assignee_id',
  'priority',
  'points',
  'sprint_id',
  'parent',
] as const

// Native selects, as in the issue view: no menu chunk, the phone's own picker.
const SELECT =
  'h-11 w-full rounded-md border border-input bg-background px-2 text-base md:h-9 md:text-sm'

const blank = (project: string): NewIssue => ({
  project,
  issue_type: 'story',
  summary: '',
  description: '',
  assignee_id: '',
  priority: 'medium',
  points: '',
  sprint_id: '',
  parent: '',
})

/** Empty fields stay out of the body, so the server applies its defaults (D5). */
const toBody = (values: NewIssue): CreateIssue => ({
  summary: values.summary,
  issue_type: values.issue_type,
  priority: values.priority,
  description: values.description || undefined,
  assignee_id: values.assignee_id ? Number(values.assignee_id) : undefined,
  points: values.points ? Number(values.points) : undefined,
  sprint_id: values.sprint_id ? Number(values.sprint_id) : undefined,
  parent: values.parent.toUpperCase() || undefined,
})

type Option = { value: string | number; label: string }

const SelectField = ({
  form,
  name,
  label,
  options,
  children,
  onPick,
}: {
  form: ReturnType<typeof useForm<NewIssue>>
  name: 'project' | 'issue_type' | 'assignee_id' | 'priority' | 'sprint_id'
  label: string
  options: Option[]
  children?: ReactNode
  onPick?: (value: string) => void
}) => (
  <FormField
    control={form.control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <select
            className={SELECT}
            {...field}
            onChange={(event) => {
              field.onChange(event)
              onPick?.(event.target.value)
            }}
          >
            {children}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
)

const entries = (labels: Record<string, string>): Option[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))

type CreateIssueDialogProps = { projectKey: string; onClose: () => void }

/** UI-33 trimmed to IA §5: one dialog for every project, opened by + Create or `c`. */
export const CreateIssueDialog = ({
  projectKey,
  onClose,
}: CreateIssueDialogProps) => {
  const navigate = useNavigate()
  const [another, setAnother] = useState(false)
  const form = useForm<NewIssue>({
    resolver: zodResolver(schema),
    defaultValues: blank(projectKey),
  })
  const project = useWatch({ control: form.control, name: 'project' })
  const { data: projects = [] } = useQuery(projectsQuery)
  const { data: members = [] } = useQuery(membersQuery(project))
  const scrum =
    projects.find((each) => each.key === project)?.board_type === 'scrum'
  const { data: sprints = [] } = useQuery({
    ...sprintsQuery(project),
    enabled: scrum,
  })
  const create = useCreateIssue(project)

  const submit = async (values: NewIssue) => {
    try {
      const created = await create.mutateAsync(toBody(values))
      toast.success(`${created.key} created`, {
        action: {
          label: 'Open',
          onClick: () =>
            void navigate({
              to: '/p/$key/issues/$number',
              params: { key: values.project, number: String(created.number) },
            }),
        },
      })
      if (!another) return onClose()
      form.reset({
        ...blank(values.project),
        issue_type: values.issue_type,
        sprint_id: values.sprint_id,
      })
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      showProblem(form.setError, FIELDS, {
        detail: error.message,
        errors: error.errors,
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto max-md:top-0 max-md:left-0 max-md:h-svh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Create issue</DialogTitle>
          <DialogDescription>
            It lands at the bottom of the backlog, or of the sprint you pick.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className='grid gap-4'
            noValidate
          >
            <div className='grid gap-4 sm:grid-cols-2'>
              <SelectField
                form={form}
                name='project'
                label='Project'
                onPick={(key) =>
                  form.reset({
                    ...form.getValues(),
                    project: key,
                    assignee_id: '',
                    sprint_id: '',
                    parent: '',
                  })
                }
                options={projects.map((each) => ({
                  value: each.key,
                  label: each.name,
                }))}
              />
              <SelectField
                form={form}
                name='issue_type'
                label='Type'
                options={entries(TYPE_LABEL)}
              />
            </div>
            <FormField
              control={form.control}
              name='summary'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summary</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      autoComplete='off'
                      maxLength={255}
                      className='h-11 md:h-9'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea className='min-h-24' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid gap-4 sm:grid-cols-2'>
              <SelectField
                form={form}
                name='assignee_id'
                label='Assignee'
                options={members.map((member) => ({
                  value: member.user_id,
                  label: member.display_name,
                }))}
              >
                <option value=''>Unassigned</option>
              </SelectField>
              <SelectField
                form={form}
                name='priority'
                label='Priority'
                options={entries(PRIORITY_LABEL)}
              />
              <FormField
                control={form.control}
                name='points'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Points</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step='any'
                        inputMode='decimal'
                        className='h-11 md:h-9'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {scrum && (
                <SelectField
                  form={form}
                  name='sprint_id'
                  label='Sprint'
                  options={sprints
                    .filter((sprint) => sprint.state !== 'closed')
                    .map((sprint) => ({
                      value: sprint.id,
                      label: sprint.name,
                    }))}
                >
                  <option value=''>Backlog</option>
                </SelectField>
              )}
              <FormField
                control={form.control}
                name='parent'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete='off'
                        placeholder={`${project}-1`}
                        className='h-11 font-mono md:h-9'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <RootError message={form.formState.errors.root?.message} />
            <div className='flex flex-wrap items-center gap-3'>
              <Label className='me-auto min-h-11 gap-2 md:min-h-0'>
                <Switch checked={another} onCheckedChange={setAnother} />
                Create another
              </Label>
              <Button
                type='button'
                variant='ghost'
                className='h-11 md:h-9'
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                className='h-11 md:h-9'
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting && (
                  <Loader2 className='animate-spin' />
                )}
                Create
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
