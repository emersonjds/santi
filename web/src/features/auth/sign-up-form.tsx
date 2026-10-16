import { type ReactNode, useEffect } from 'react'
import { z } from 'zod'
import { type ControllerRenderProps, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, UserPlus } from 'lucide-react'
import {
  AGE_REQUIRED,
  TERMS_REQUIRED,
  TermsLabel,
} from '@/features/legal/terms-label'
import {
  legalDocumentsQuery,
  useLegalRequired,
} from '@/entities/session/legal-queries'
import { sessionQuery } from '@/entities/session/session-query'
import { api } from '@/shared/api/client'
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
import { PasswordInput } from '@/shared/ui/password-input'
import { RootError } from '@/shared/ui/root-error'

// Mirrors the server rules in auth/domain.rs; the server stays the authority.
const schema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(100, 'Use at most 100 characters.'),
  email: z.email('Enter an email address.'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters.')
    .max(128, 'Use at most 128 characters.'),
  accept_terms: z.boolean().refine(Boolean, TERMS_REQUIRED),
  confirm_age: z.boolean().refine(Boolean, AGE_REQUIRED),
})

type SignUp = z.infer<typeof schema>

const FIELDS = [
  'display_name',
  'email',
  'password',
  'accept_terms',
  'confirm_age',
] as const

type ConsentProps = {
  value: boolean
  onChange: (checked: boolean) => void
  field: Omit<
    ControllerRenderProps<SignUp, 'accept_terms' | 'confirm_age'>,
    'value' | 'onChange'
  >
  children: ReactNode
}

const Consent = ({ value, onChange, field, children }: ConsentProps) => (
  <FormItem>
    <div className='flex min-h-11 items-start gap-3'>
      <FormControl>
        <input
          type='checkbox'
          className='mt-0.5 size-5 shrink-0 accent-primary'
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          {...field}
        />
      </FormControl>
      <FormLabel className='block leading-snug font-normal'>
        {children}
      </FormLabel>
    </div>
    <FormMessage />
  </FormItem>
)

export const SignUpForm = ({ redirectTo = '/' }: { redirectTo?: string }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: legal } = useQuery(legalDocumentsQuery)
  const legalRequired = useLegalRequired(legal?.required)
  const form = useForm<SignUp>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name: '',
      email: '',
      password: '',
      accept_terms: false,
      confirm_age: false,
    },
  })

  // Without legal pages there is nothing to accept; the server ignores both fields then.
  useEffect(() => {
    if (legalRequired) return
    form.setValue('accept_terms', true)
    form.setValue('confirm_age', true)
  }, [form, legalRequired])

  const signUp = async (body: SignUp) => {
    const { data, error } = await api.POST('/api/auth/register', { body })
    if (error) return showProblem(form.setError, FIELDS, error)
    queryClient.setQueryData(sessionQuery.queryKey, data)
    await navigate({ to: redirectTo, replace: true })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(signUp)}
        className='grid gap-4'
        noValidate
      >
        <FormField
          control={form.control}
          name='display_name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete='name' className='h-11' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  autoComplete='email'
                  className='h-11'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='new-password' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {legalRequired && (
          <>
            <FormField
              control={form.control}
              name='accept_terms'
              render={({ field: { value, onChange, ...field } }) => (
                <Consent value={value} onChange={onChange} field={field}>
                  <TermsLabel />
                </Consent>
              )}
            />
            <FormField
              control={form.control}
              name='confirm_age'
              render={({ field: { value, onChange, ...field } }) => (
                <Consent value={value} onChange={onChange} field={field}>
                  I am 18 or older
                </Consent>
              )}
            />
          </>
        )}
        <RootError message={form.formState.errors.root?.message} />
        <Button className='h-11' disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 className='animate-spin' />
          ) : (
            <UserPlus />
          )}
          Create account
        </Button>
      </form>
    </Form>
  )
}
