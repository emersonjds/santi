import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ROLE_LABEL } from '@/entities/project/labels'
import {
  membersQuery,
  projectQuery,
  projectsQuery,
} from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import {
  type Member,
  type MemberRole,
  api,
  dataOrThrow,
  okOrThrow,
} from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { RootError } from '@/shared/ui/root-error'

type ControlProps = { projectKey: string; member: Member; locked: boolean }

/** Members, and the project itself: an admin who steps down loses the admin pages, one who leaves the project. */
const useMembersWrite = <Variables,>(
  projectKey: string,
  member: Member,
  own: 'leave' | 'step down',
  write: (variables: Variables) => Promise<unknown>
) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: me } = useQuery(sessionQuery)
  const refresh = () =>
    Promise.all(
      [membersQuery(projectKey), projectQuery(projectKey), projectsQuery].map(
        ({ queryKey }) =>
          queryClient.invalidateQueries({ queryKey, exact: true })
      )
    )

  const afterOwnChange = async () => {
    const name =
      queryClient.getQueryData(projectQuery(projectKey).queryKey)?.name ??
      projectKey
    if (own === 'leave') {
      await navigate({ to: '/' })
      queryClient.removeQueries({ queryKey: projectQuery(projectKey).queryKey })
      await refresh()
      return toast.success(`You left ${name}.`)
    }
    await navigate({ to: '/p/$key/board', params: { key: projectKey } })
    await refresh()
    toast.success(`You are a member of ${name} now.`)
  }

  return useMutation({
    mutationFn: write,
    onSuccess: () => (me?.id === member.user_id ? afterOwnChange() : refresh()),
  })
}

export const RoleSelect = ({ projectKey, member, locked }: ControlProps) => {
  const change = useMembersWrite(
    projectKey,
    member,
    'step down',
    async (role: MemberRole) =>
      dataOrThrow(
        await api.PUT('/api/projects/{key}/members/{user_id}', {
          params: { path: { key: projectKey, user_id: member.user_id } },
          body: { role },
        })
      )
  )
  return (
    <>
      <select
        aria-label={`Role of ${member.display_name}`}
        value={member.role}
        disabled={locked || change.isPending}
        onChange={(event) =>
          change.mutate(event.target.value === 'admin' ? 'admin' : 'member')
        }
        className='h-11 rounded-md border border-input bg-background px-2 text-base disabled:opacity-60 md:h-9 md:text-sm'
      >
        {(['admin', 'member'] as const).map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
      {change.error && (
        <span className='basis-full'>
          <RootError message={change.error.message} />
        </span>
      )}
    </>
  )
}

export const RemoveMemberButton = ({
  projectKey,
  member,
  locked,
}: ControlProps) => {
  const [open, setOpen] = useState(false)
  const remove = useMembersWrite(projectKey, member, 'leave', async () =>
    okOrThrow(
      await api.DELETE('/api/projects/{key}/members/{user_id}', {
        params: { path: { key: projectKey, user_id: member.user_id } },
      })
    )
  )
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) remove.reset()
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant='outline'
          className='h-11 md:h-9'
          disabled={locked}
          aria-label={`Remove ${member.display_name}`}
        >
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member.display_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to this project. Issues they reported or hold stay
            as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RootError message={remove.error?.message} />
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11 md:h-9'>Cancel</AlertDialogCancel>
          <Button
            variant='destructive'
            className='h-11 md:h-9'
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, { onSuccess: () => setOpen(false) })
            }
          >
            Remove member
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
