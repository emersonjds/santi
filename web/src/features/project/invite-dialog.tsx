import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Copy, UserPlus } from 'lucide-react'
import { api } from '@/shared/api/client'
import { showProblem } from '@/shared/lib/show-problem'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
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

const PEOPLE = 'Between 1 and 50.'
const ADMIN_ALONE = 'A link for more than one person can only add members.'
const UNREACHABLE =
  'Could not create the link. Check your connection and try again.'

// Mirrors members/domain.rs; the server stays the authority.
const schema = z
  .object({
    role: z.enum(['member', 'admin']),
    max_uses: z
      .string()
      .refine(
        (text) => /^\d+$/.test(text) && +text >= 1 && +text <= 50,
        PEOPLE
      ),
  })
  .refine((values) => values.role === 'member' || +values.max_uses === 1, {
    message: ADMIN_ALONE,
    path: ['max_uses'],
  })

type NewInvite = z.infer<typeof schema>

const FIELDS = ['max_uses'] as const

type Invite = { token: string; max_uses: number }

const inviteLink = (token: string) =>
  new URL(`/invites/${token}`, location.origin).href

const InviteLink = ({ invite }: { invite: Invite }) => {
  const [copied, setCopied] = useState(false)
  const link = inviteLink(invite.token)

  // Clipboard needs a secure origin; elsewhere the link stays selectable in the field.
  const copy = () =>
    void navigator.clipboard?.writeText(link).then(() => setCopied(true))

  return (
    <div className='grid gap-2'>
      <Label htmlFor='invite-link'>Invite link</Label>
      <div className='flex gap-2'>
        <Input
          id='invite-link'
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
          className='h-11 font-mono text-base md:text-sm'
        />
        <Button type='button' className='h-11' onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <p className='text-sm text-muted-foreground'>
        Link for {invite.max_uses}{' '}
        {invite.max_uses === 1 ? 'person' : 'people'} · valid 7 days
      </p>
    </div>
  )
}

export const InviteDialog = ({ projectKey }: { projectKey: string }) => {
  const [created, setCreated] = useState<Invite | null>(null)
  const form = useForm<NewInvite>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'member', max_uses: '1' },
  })

  const create = async (values: NewInvite) => {
    try {
      const { data, error } = await api.POST('/api/projects/{key}/invites', {
        params: { path: { key: projectKey } },
        body: { role: values.role, max_uses: Number(values.max_uses) },
      })
      if (error) return showProblem(form.setError, FIELDS, error)
      setCreated(data)
    } catch {
      form.setError('root', { message: UNREACHABLE })
    }
  }

  const close = () => {
    setCreated(null)
    form.reset()
  }

  return (
    <Dialog onOpenChange={(open) => open || close()}>
      <DialogTrigger asChild>
        <Button variant='outline' className='h-11 md:h-9'>
          <UserPlus />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>Invite people with a link.</DialogDescription>
        </DialogHeader>
        {created ? (
          <InviteLink invite={created} />
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(create)}
              className='grid gap-3'
              noValidate
            >
              <div className='grid grid-cols-2 items-start gap-3'>
                <FormField
                  control={form.control}
                  name='role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invite as</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          className='h-11 rounded-md border border-input bg-background px-3 text-base md:text-sm'
                        >
                          <option value='member'>Member</option>
                          <option value='admin'>Admin</option>
                        </select>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='max_uses'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How many people</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          max={50}
                          inputMode='numeric'
                          className='h-11 text-base md:text-sm'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <RootError message={form.formState.errors.root?.message} />
              <Button className='h-11' disabled={form.formState.isSubmitting}>
                Create invite link
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
