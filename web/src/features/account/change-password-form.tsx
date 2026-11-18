import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2 } from 'lucide-react'
import { sessionsQuery } from '@/entities/user/sessions'
import { api } from '@/shared/api/client'
import { useT } from '@/shared/i18n/i18n'
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
import { messages } from './messages'

type Passwords = { current: string; new: string; confirm: string }

const minutes = (response: Response) =>
  Math.max(1, Math.ceil(Number(response.headers.get('Retry-After') ?? 60) / 60))

/** SAN-198: messages are fixed here; the server's wording never reaches the screen. */
export const ChangePasswordForm = () => {
  const t = useT(messages)
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
    if (!result) return form.setError('root', { message: t('passwordFailed') })
    const { data, error, response } = result
    if (response.status === 429)
      return form.setError('root', {
        message: t('passwordTooMany', { count: minutes(response) }),
      })
    const field = error?.errors?.[0]?.field
    if (response.status === 422 && field === 'current')
      return form.setError('current', {
        message: t('passwordWrong'),
      })
    if (response.status === 422 && field === 'new')
      return form.setError('new', { message: t('passwordRule') })
    if (!data) return form.setError('root', { message: t('passwordFailed') })
    toast.success(
      data.signed_out === 0
        ? t('passwordChangedAlone')
        : t('passwordChanged', { count: data.signed_out })
    )
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
              <FormLabel>{t('currentPassword')}</FormLabel>
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
              if (length < 10 || length > 128) return t('passwordRule')
              return next !== current || t('passwordSame')
            },
          }}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t('newPassword')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='new-password' {...field} />
              </FormControl>
              {!fieldState.error && (
                <FormDescription>{t('passwordRule')}</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirm'
          rules={{
            validate: (confirm, values) =>
              confirm === values.new || t('passwordMismatch'),
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('confirmPassword')}</FormLabel>
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
          {t('changePassword')}
        </Button>
      </form>
    </Form>
  )
}
