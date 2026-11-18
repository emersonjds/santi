import { type FormEvent, type ReactNode, useId, useState } from 'react'
import type { UseFormSetError } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { sessionQuery } from '@/entities/session/session-query'
import { api } from '@/shared/api/client'
import { showProblem } from '@/shared/lib/show-problem'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { PasswordInput } from '@/shared/ui/password-input'
import { RootError } from '@/shared/ui/root-error'

type SignIn = { email: string; password: string }
type Errors = Partial<Record<keyof SignIn | 'root', string>>

const FIELDS = ['email', 'password'] as const

// Same pattern as zod's `z.email()`; zod and react-hook-form stay off the first visit (SAN-232).
const EMAIL =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/

const validate = {
  email: (value: string) =>
    EMAIL.test(value) ? undefined : 'Enter an email address.',
  password: (value: string) => (value ? undefined : 'Enter your password.'),
}

type Control = {
  id: string
  name: string
  'aria-invalid': boolean
  'aria-describedby'?: string
}

const Field = ({
  name,
  label,
  error,
  children,
}: {
  name: keyof SignIn
  label: string
  error?: string
  children: (control: Control) => ReactNode
}) => {
  const id = useId()
  return (
    <div data-slot='form-item' className='grid gap-2'>
      <Label
        htmlFor={id}
        data-error={!!error}
        className='data-[error=true]:text-destructive'
      >
        {label}
      </Label>
      {children({
        id,
        name,
        'aria-invalid': !!error,
        'aria-describedby': error ? `${id}-message` : undefined,
      })}
      {error && (
        <p id={`${id}-message`} className='text-sm text-destructive'>
          {error}
        </p>
      )}
    </div>
  )
}

export const SignInForm = ({ redirectTo = '/' }: { redirectTo?: string }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const setError: UseFormSetError<SignIn> = (name, { message }) =>
    setErrors((current) => ({ ...current, [name]: message }))

  const revalidate = (name: keyof SignIn, value: string) => {
    if (submitted) setError(name, { message: validate[name](value) })
  }

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const form = event.currentTarget
    const data = new FormData(form)
    const body = {
      email: String(data.get('email')),
      password: String(data.get('password')),
    }
    const invalid = {
      email: validate.email(body.email),
      password: validate.password(body.password),
    }
    setErrors(invalid)
    const first = FIELDS.find((name) => invalid[name])
    if (first)
      return form.querySelector<HTMLElement>(`[name=${first}]`)?.focus()

    setSubmitting(true)
    try {
      const { data: session, error } = await api.POST('/api/auth/login', {
        body,
      })
      if (error) return showProblem(setError, FIELDS, error)
      queryClient.setQueryData(sessionQuery.queryKey, session)
      await navigate({ to: redirectTo, replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={signIn} className='grid gap-4' noValidate>
      <Field name='email' label='Email' error={errors.email}>
        {(control) => (
          <Input
            type='email'
            autoComplete='email'
            className='h-11'
            onChange={(event) => revalidate('email', event.target.value)}
            {...control}
          />
        )}
      </Field>
      <Field name='password' label='Password' error={errors.password}>
        {(control) => (
          <PasswordInput
            autoComplete='current-password'
            onChange={(event) => revalidate('password', event.target.value)}
            {...control}
          />
        )}
      </Field>
      <RootError message={errors.root} />
      <Button className='h-11' disabled={submitting}>
        {submitting ? <Loader2 className='animate-spin' /> : <LogIn />}
        Sign in
      </Button>
    </form>
  )
}
