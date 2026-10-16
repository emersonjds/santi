import { type FormEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Copy, UserPlus } from 'lucide-react'
import { type MemberRole, api, dataOrThrow } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { RootError } from '@/shared/ui/root-error'

type Invite = { token: string; expires_at: string }

const inviteLink = (token: string) =>
  new URL(`${import.meta.env.BASE_URL}invites/${token}`, location.origin).href

const InviteLink = ({ invite }: { invite: Invite }) => {
  const [copied, setCopied] = useState(false)
  const link = inviteLink(invite.token)
  const expires = new Date(invite.expires_at).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  })

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
        Works once. Expires {expires}.
      </p>
    </div>
  )
}

export const InviteDialog = ({ projectKey }: { projectKey: string }) => {
  const [role, setRole] = useState<MemberRole>('member')
  const invite = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST('/api/projects/{key}/invites', {
          params: { path: { key: projectKey } },
          body: { role },
        })
      ),
  })

  const create = (event: FormEvent) => {
    event.preventDefault()
    invite.mutate()
  }

  return (
    <Dialog onOpenChange={(open) => open || invite.reset()}>
      <DialogTrigger asChild>
        <Button variant='outline' className='h-11 md:h-9'>
          <UserPlus />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            Invite people with a link. Each link works once.
          </DialogDescription>
        </DialogHeader>
        {invite.data ? (
          <InviteLink invite={invite.data} />
        ) : (
          <form onSubmit={create} className='grid gap-3'>
            <Label htmlFor='invite-role'>Invite as</Label>
            <select
              id='invite-role'
              value={role}
              onChange={(event) =>
                setRole(event.target.value === 'admin' ? 'admin' : 'member')
              }
              className='h-11 rounded-md border border-input bg-background px-3 text-base md:text-sm'
            >
              <option value='member'>Member</option>
              <option value='admin'>Admin</option>
            </select>
            <RootError message={invite.error?.message} />
            <Button className='h-11' disabled={invite.isPending}>
              Create invite link
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
