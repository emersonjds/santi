import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { projectQuery, projectsQuery } from '@/entities/project/project-queries'
import { api } from '@/shared/api/client'
import { showProblem } from '@/shared/lib/show-problem'
import { Button } from '@/shared/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { RootError } from '@/shared/ui/root-error'
import { suggestKey } from './suggest-key'

// Mirrors projects/domain.rs; the server stays the authority.
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name.')
    .max(100, 'Use at most 100 characters.'),
  key: z
    .string()
    .trim()
    .regex(
      /^[A-Z][A-Z0-9]{1,9}$/,
      'Use 2 to 10 letters or digits, starting with a letter.'
    ),
  board_type: z.enum(['scrum', 'kanban']),
})

type NewProject = z.infer<typeof schema>

const FIELDS = ['name', 'key', 'board_type'] as const

const BOARD_TYPES = [
  { value: 'scrum', label: 'Scrum', help: 'Plan work in sprints.' },
  { value: 'kanban', label: 'Kanban', help: 'Keep work flowing, no sprints.' },
] as const

export const CreateProjectForm = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<NewProject>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', key: '', board_type: 'scrum' },
  })

  const create = async (body: NewProject) => {
    const { data, error, response } = await api.POST('/api/projects', { body })
    if (response.status === 409)
      return form.setError('key', {
        message: 'This key is already used by another project.',
      })
    if (error) return showProblem(form.setError, FIELDS, error)
    queryClient.setQueryData(projectQuery(data.key).queryKey, data)
    await queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey })
    await navigate({
      to: data.board_type === 'scrum' ? '/p/$key/backlog' : '/p/$key/board',
      params: { key: data.key },
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(create)}
        className='grid gap-5'
        noValidate
      >
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  autoComplete='off'
                  className='h-11 text-base md:text-sm'
                  {...field}
                  onChange={(event) => {
                    field.onChange(event)
                    if (form.getFieldState('key').isDirty) return
                    form.setValue('key', suggestKey(event.target.value))
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='key'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Key</FormLabel>
              <FormControl>
                <Input
                  autoComplete='off'
                  className='h-11 font-mono text-base md:text-sm'
                  {...field}
                  onChange={(event) =>
                    field.onChange(event.target.value.toUpperCase())
                  }
                />
              </FormControl>
              <FormDescription>
                2 to 10 letters or digits, like WEB. It starts every issue
                number: WEB-1.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='board_type'
          render={({ field }) => (
            <fieldset className='grid gap-2'>
              <legend className='mb-2 text-sm font-medium'>Board</legend>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className='grid gap-2 sm:grid-cols-2'
              >
                {BOARD_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className='flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent'
                  >
                    <RadioGroupItem value={type.value} className='mt-0.5' />
                    <span className='grid gap-0.5'>
                      <span className='font-medium'>{type.label}</span>
                      <span className='text-sm text-muted-foreground'>
                        {type.help}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          )}
        />
        <RootError message={form.formState.errors.root?.message} />
        <div className='flex flex-wrap gap-2'>
          <Button className='h-11' disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && (
              <Loader2 className='animate-spin' />
            )}
            Create project
          </Button>
          <Button asChild variant='ghost' className='h-11'>
            <Link to='/'>Cancel</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
