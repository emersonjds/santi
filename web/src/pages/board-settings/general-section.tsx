import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { projectQuery, projectsQuery } from '@/entities/project/project-queries'
import { type Project, api, okOrThrow } from '@/shared/api/client'
import { lockedButton, lockedField, useReadOnly } from '@/shared/lib/read-only'
import { showProblem } from '@/shared/lib/show-problem'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
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
import { RootError } from '@/shared/ui/root-error'

type Names = { name: string; key: string }

const FIELDS = ['name', 'key'] as const
const KEY_CONFLICT = 'urn:santi:error:project-key'
const FAILED = "Couldn't save. Try again."
const ADMIN_ONLY = 'Only a project admin can change the name or key.'
const INPUT = 'h-11 text-base md:text-sm'

const changes = (values: Names, project: Project) => {
  const name = values.name.trim()
  const key = values.key.trim()
  return {
    ...(name !== project.name && { name }),
    ...(key !== project.key && { key }),
  }
}

/** SAN-225: admins rename the project and change its key; old keys stay as previous keys. */
export const GeneralSection = ({ project }: { project: Project }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const note = useReadOnly()
  const heading = useRef<HTMLHeadingElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const form = useForm<Names>({
    defaultValues: { name: project.name, key: project.key },
  })
  const { isDirty, isSubmitting, dirtyFields } = form.formState

  const save = async (values: Names) => {
    const result = await api
      .PATCH('/api/projects/{key}', {
        params: { path: { key: project.key } },
        body: changes(values, project),
      })
      .catch(() => undefined)
    if (!result || result.response.status >= 500) return toast.error(FAILED)
    const { data, error, response } = result
    if (response.status === 403)
      return form.setError('root', { message: ADMIN_ONLY })
    if (error) {
      if (error.type.startsWith(KEY_CONFLICT))
        form.setError('key', { message: error.detail })
      else showProblem(form.setError, FIELDS, error)
      if (form.getFieldState('key').error) form.setFocus('key')
      return
    }
    queryClient.setQueryData(projectQuery(project.key).queryKey, data)
    queryClient.setQueryData(projectQuery(data.key).queryKey, data)
    void queryClient.invalidateQueries({
      queryKey: projectsQuery.queryKey,
      exact: true,
    })
    void queryClient.invalidateQueries({ queryKey: ['home'] })
    form.reset({ name: data.name, key: data.key })
    if (data.key === project.key) return toast.success('Saved.')
    toast.success(`Saved. ${data.key} is now the project's key.`)
    await navigate({
      to: '/p/$key/settings',
      params: { key: data.key },
      replace: true,
    })
  }

  const remove = useMutation({
    mutationFn: async (alias: string) =>
      okOrThrow(
        await api.DELETE('/api/projects/{key}/aliases/{alias}', {
          params: { path: { key: project.key, alias } },
        })
      ),
    onSuccess: (_, alias) => {
      const next = project.previous_keys.indexOf(alias) + 1
      const target =
        list.current?.querySelectorAll('button')[next] ?? heading.current
      target?.focus()
      queryClient.removeQueries({ queryKey: projectQuery(alias).queryKey })
      queryClient.setQueryData(
        projectQuery(project.key).queryKey,
        (cached) =>
          cached && {
            ...cached,
            previous_keys: cached.previous_keys.filter((key) => key !== alias),
          }
      )
      toast.success(`Removed ${alias}. It's free for other projects now.`)
    },
    onError: (_, alias) => toast.error(`Couldn't remove ${alias}. Try again.`),
  })

  return (
    <section aria-labelledby='general' className='grid gap-3'>
      <h2
        id='general'
        ref={heading}
        tabIndex={-1}
        className='text-lg font-semibold outline-none'
      >
        General
      </h2>
      <div className='grid gap-6 rounded-md border p-4'>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(save)}
            className='grid gap-4 sm:max-w-md'
            noValidate
          >
            <FormField
              control={form.control}
              name='name'
              rules={{
                validate: (name) => name.trim() !== '' || 'Enter a name.',
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete='off'
                      className={INPUT}
                      {...field}
                      readOnly={isSubmitting}
                      {...lockedField(note)}
                    />
                  </FormControl>
                  <FormMessage role='alert' />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='key'
              render={({ field }) => (
                <FormItem className='group'>
                  <FormLabel>Project key</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete='off'
                      className={cn(INPUT, 'font-mono')}
                      {...field}
                      readOnly={isSubmitting}
                      {...lockedField(note)}
                    />
                  </FormControl>
                  <FormDescription
                    className={cn(
                      !dirtyFields.key && 'hidden group-focus-within:block'
                    )}
                  >
                    Links and issue keys with {project.key} keep working after
                    you change it.
                  </FormDescription>
                  <FormMessage role='alert' />
                </FormItem>
              )}
            />
            <RootError message={form.formState.errors.root?.message} />
            {!note && (
              <Button
                className='h-11 sm:w-fit'
                disabled={!isDirty || isSubmitting}
              >
                {isSubmitting && <Loader2 className='animate-spin' />}
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            )}
          </form>
        </Form>
        {project.previous_keys.length > 0 && (
          <div className='grid gap-2'>
            <h3 id='previous-keys' className='text-sm font-medium'>
              Previous keys
            </h3>
            <ul
              ref={list}
              aria-labelledby='previous-keys'
              className='max-h-72 divide-y overflow-y-auto rounded-md border'
            >
              {project.previous_keys.map((alias) => (
                <li
                  key={alias}
                  className='flex min-h-11 items-center justify-between gap-3 py-1 ps-3 pe-1'
                >
                  <span className='rounded border px-1.5 font-mono text-xs'>
                    {alias}
                  </span>
                  <Button
                    variant='ghost'
                    className='h-11'
                    aria-label={`Remove ${alias}`}
                    onClick={() => !remove.isPending && remove.mutate(alias)}
                    {...lockedButton(note)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
