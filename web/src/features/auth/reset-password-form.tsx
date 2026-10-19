import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { KeyRound, Loader2 } from 'lucide-react'
import {
  passwordResetQuery,
  sessionQuery,
} from '@/entities/session/session-query'
import { api, hasStatus } from '@/shared/api/client'
import { showProblem } from '@/shared/lib/show-problem'
import { Button } from '@/shared/ui/button'
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
import { LoadFailed } from '@/shared/ui/load-failed'
import { PasswordInput } from '@/shared/ui/password-input'
import { RootError } from '@/shared/ui/root-error'
import { Skeleton } from '@/shared/ui/skeleton'

// Same length rule as the sign-up form; the server stays the authority.
const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Use at least 10 characters.')
      .max(128, 'Use at most 128 characters.'),
    confirm: z.string(),
  })
  .refine(({ password, confirm }) => password === confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  })

type NewPassword = z.infer<typeof schema>

const DeadLink = () => (
  <div className='grid gap-4'>
    <RootError message='This reset link has expired or was already used. Ask the person who sent it for a new one.' />
    <Button asChild variant='outline' className='h-11'>
      <Link to='/login'>Sign in</Link>
    </Button>
  </div>
)

/** Opens the link, then sets the new password and signs in; a dead link says so and offers sign-in. */
export const ResetPasswordForm = ({ token }: { token: string }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const preview = useQuery(passwordResetQuery(token))
  const [dead, setDead] = useState(false)
  const form = useForm<NewPassword>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  if (dead || hasStatus(preview.error, 404)) return <DeadLink />
  if (preview.error)
    return (
      <LoadFailed
        message="Couldn't open this link."
        onRetry={() => void preview.refetch()}
      />
    )
  if (!preview.data)
    return (
      <Skeleton
        role='status'
        aria-label='Loading reset link'
        className='h-60 w-full'
      />
    )

  const save = async ({ password }: NewPassword) => {
    const { data, error, response } = await api.POST(
      '/api/password-resets/{token}',
      { params: { path: { token } }, body: { password } }
    )
    if (response.status === 404) return setDead(true)
    if (error) return showProblem(form.setError, ['password'], error)
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== 'password-resets',
    })
    queryClient.setQueryData(sessionQuery.queryKey, data)
    await navigate({ to: '/', replace: true })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(save)}
        className='grid gap-4'
        noValidate
      >
        <div className='grid gap-2'>
          <Label htmlFor='reset-email'>Email</Label>
          <Input
            id='reset-email'
            type='email'
            autoComplete='username'
            className='h-11'
            value={preview.data.email}
            readOnly
          />
        </div>
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='new-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirm'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='new-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <RootError message={form.formState.errors.root?.message} />
        <Button className='h-11' disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 className='animate-spin' />
          ) : (
            <KeyRound />
          )}
          Save and sign in
        </Button>
      </form>
    </Form>
  )
}
