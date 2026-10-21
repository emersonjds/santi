import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2 } from 'lucide-react'
import { sessionsQuery } from '@/entities/user/sessions'
import { api } from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'
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
import { PasswordInput } from '@/shared/ui/password-input'
import { RootError } from '@/shared/ui/root-error'

type Passwords = { current: string; new: string; confirm: string }

const RULE = '10 to 128 characters.'
const SAME = 'Choose a password different from the current one.'
const FAILED = 'Could not change the password.'

const changed = (count: number) => {
  if (count === 0) return 'Password changed. No other sessions were signed out.'
  if (count === 1) return 'Password changed. 1 other session was signed out.'
  return `Password changed. ${count} other sessions were signed out.`
}

const minutes = (response: Response) => {
  const count = Math.max(
    1,
    Math.ceil(Number(response.headers.get('Retry-After') ?? 60) / 60)
  )
  return `${count} minute${count === 1 ? '' : 's'}`
}

/** SAN-198: messages are fixed here; the server's wording never reaches the screen. */
export const ChangePasswordForm = () => {
  const queryClient = useQueryClient()
  const form = useForm<Passwords>({
    defaultValues: { current: '', new: '', confirm: '' },
  })

  const save = async (values: Passwords) => {
    const result = await api
      .POST('/api/me/password', {
        body: { current: values.current, new: values.new },
      })
      .catch(() => undefined)
    if (!result) return form.setError('root', { message: FAILED })
    const { data, error, response } = result
    if (response.status === 429)
      return form.setError('root', {
        message: `Too many attempts. Try again in ${minutes(response)}.`,
      })
    const field = error?.errors?.[0]?.field
    if (response.status === 422 && field === 'current')
      return form.setError('current', {
        message: 'The current password is not right.',
      })
    if (response.status === 422 && field === 'new')
      return form.setError('new', { message: RULE })
    if (!data) return form.setError('root', { message: FAILED })
    toast.success(changed(data.signed_out))
    // reset() drops the field refs setFocus reads.
    form.setFocus('current')
    form.reset()
    void queryClient.invalidateQueries({ queryKey: sessionsQuery.queryKey })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(save)}
        className='grid gap-4'
        noValidate
      >
        <FormField
          control={form.control}
          name='current'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='current-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='new'
          rules={{
            validate: (next, { current }) => {
              const length = [...next].length
              if (length < 10 || length > 128) return RULE
              return next !== current || SAME
            },
          }}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='new-password' {...field} />
              </FormControl>
              {!fieldState.error && <FormDescription>{RULE}</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirm'
          rules={{
            validate: (confirm, values) =>
              confirm === values.new || 'Passwords do not match.',
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='new-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <RootError message={form.formState.errors.root?.message} />
        <Button
          className='h-11 sm:w-fit'
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? (
            <Loader2 className='animate-spin' />
          ) : (
            <KeyRound />
          )}
          Change password
        </Button>
      </form>
    </Form>
  )
}
