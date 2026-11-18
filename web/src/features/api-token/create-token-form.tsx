import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Loader2 } from 'lucide-react'
import { tokensQuery } from '@/entities/user/api-tokens'
import { api } from '@/shared/api/client'
import { useT } from '@/shared/i18n/i18n'
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
import { messages } from './messages'

type NewToken = { name: string }

const FIELDS = ['name'] as const

const TokenOnce = ({
  token,
  onDone,
}: {
  token: string
  onDone: () => void
}) => {
  const t = useT(messages)
  const [copied, setCopied] = useState(false)
  // Clipboard needs a secure origin; elsewhere the token stays selectable in the field.
  const copy = () =>
    void navigator.clipboard?.writeText(token).then(() => setCopied(true))

  return (
    <div className='grid gap-2 rounded-lg border border-primary bg-accent p-3'>
      <Label htmlFor='new-token'>{t('newToken')}</Label>
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
          {copied ? t('copied') : t('copyToken')}
        </Button>
      </div>
      <p role='status' className='text-sm font-medium'>
        {t('copyNow')}
      </p>
      <Button
        type='button'
        variant='outline'
        className='h-11 justify-self-start md:h-9'
        onClick={onDone}
      >
        {t('done')}
      </Button>
    </div>
  )
}

export const CreateTokenForm = () => {
  const t = useT(messages)
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
          rules={{
            // Mirrors auth/service.rs; the server stays the authority. No zod: it would put /account over its D39 budget.
            validate: (name) => {
              const trimmed = name.trim()
              if (trimmed === '') return t('enterName')
              return trimmed.length <= 100 || t('nameTooLong')
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel className='sr-only'>{t('tokenName')}</FormLabel>
              <FormControl>
                <Input
                  autoComplete='off'
                  placeholder={t('tokenNameHint')}
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
          {t('createToken')}
        </Button>
        <div className='sm:col-span-2'>
          <RootError message={form.formState.errors.root?.message} />
        </div>
      </form>
    </Form>
  )
}
