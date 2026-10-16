import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, UserPlus } from 'lucide-react'
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
})

type SignUp = z.infer<typeof schema>

const FIELDS = ['display_name', 'email', 'password'] as const

export const SignUpForm = ({ redirectTo = '/' }: { redirectTo?: string }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<SignUp>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: '', email: '', password: '' },
  })

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
