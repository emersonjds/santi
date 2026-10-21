import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Loader2 } from 'lucide-react'
import { tokensQuery } from '@/entities/user/api-tokens'
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
import { Label } from '@/shared/ui/label'
import { RootError } from '@/shared/ui/root-error'

type NewToken = { name: string }

// Mirrors auth/service.rs; the server stays the authority. No zod: it would put /account over its D39 budget.
const checkName = (name: string) => {
  const trimmed = name.trim()
  if (trimmed === '') return 'Enter a name.'
  return trimmed.length <= 100 || 'Use at most 100 characters.'
}

const FIELDS = ['name'] as const

const TokenOnce = ({
  token,
  onDone,
}: {
  token: string
  onDone: () => void
}) => {
  const [copied, setCopied] = useState(false)
  // Clipboard needs a secure origin; elsewhere the token stays selectable in the field.
  const copy = () =>
    void navigator.clipboard?.writeText(token).then(() => setCopied(true))

  return (
    <div className='grid gap-2 rounded-lg border border-primary bg-accent p-3'>
      <Label htmlFor='new-token'>New token</Label>
      <div className='flex gap-2'>
        <Input
          id='new-token'
          readOnly
          value={token}
          onFocus={(event) => event.currentTarget.select()}
          className='h-11 bg-background font-mono text-base md:text-sm'
        />
        <Button type='button' className='h-11' onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy token'}
        </Button>
      </div>
      <p role='status' className='text-sm font-medium'>
        Copy it now: you will not see it again.
      </p>
      <Button
        type='button'
        variant='outline'
        className='h-11 justify-self-start md:h-9'
        onClick={onDone}
      >
        Done
      </Button>
    </div>
  )
}

export const CreateTokenForm = () => {
  const queryClient = useQueryClient()
  const [created, setCreated] = useState<string | null>(null)
  const form = useForm<NewToken>({
    defaultValues: { name: '' },
  })

  const create = async ({ name }: NewToken) => {
    const { data, error } = await api.POST('/api/tokens', {
      body: { name: name.trim() },
    })
    if (error) return showProblem(form.setError, FIELDS, error)
    setCreated(data.token)
    form.reset()
    await queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey })
  }

  if (created)
    return <TokenOnce token={created} onDone={() => setCreated(null)} />

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(create)}
        className='grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start'
        noValidate
      >
        <FormField
          control={form.control}
          name='name'
          rules={{ validate: checkName }}
          render={({ field }) => (
            <FormItem>
              <FormLabel className='sr-only'>Token name</FormLabel>
              <FormControl>
                <Input
                  autoComplete='off'
                  placeholder='Token name, like laptop or CI'
                  className='h-11 text-base md:text-sm'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='h-11' disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className='animate-spin' />}
          Create token
        </Button>
        <div className='sm:col-span-2'>
          <RootError message={form.formState.errors.root?.message} />
        </div>
      </form>
    </Form>
  )
}
