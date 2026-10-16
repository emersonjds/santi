import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
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

const schema = z.object({
  email: z.email('Enter an email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type SignIn = z.infer<typeof schema>

const FIELDS = ['email', 'password'] as const

export const SignInForm = ({ redirectTo = '/' }: { redirectTo?: string }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<SignIn>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const signIn = async (body: SignIn) => {
    const { data, error } = await api.POST('/api/auth/login', { body })
    if (error) return showProblem(form.setError, FIELDS, error)
    queryClient.setQueryData(sessionQuery.queryKey, data)
    await navigate({ to: redirectTo, replace: true })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(signIn)}
        className='grid gap-4'
        noValidate
      >
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
                <PasswordInput autoComplete='current-password' {...field} />
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
            <LogIn />
          )}
          Sign in
        </Button>
      </form>
    </Form>
  )
}
