import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { myProjectsQuery } from '@/entities/home/home-queries'
import { ROLE_LABEL } from '@/entities/project/labels'
import {
  invitePreviewQuery,
  projectQuery,
  projectsQuery,
} from '@/entities/project/project-queries'
import { api, dataOrThrow, hasStatus } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { RootError } from '@/shared/ui/root-error'
import { Skeleton } from '@/shared/ui/skeleton'

const ASK_AGAIN = 'Ask for a new one.'
const UNKNOWN = `This invite link does not exist. ${ASK_AGAIN}`

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='flex justify-between gap-3 py-2'>
    <dt className='text-muted-foreground'>{label}</dt>
    <dd className='font-medium'>{children}</dd>
  </div>
)

const JoinButton = ({ token }: { token: string }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const join = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST('/api/invites/{token}/accept', {
          params: { path: { token } },
        })
      ),
    onSuccess: async (project) => {
      queryClient.setQueryData(projectQuery(project.key).queryKey, project)
      await Promise.all(
        [projectsQuery.queryKey, myProjectsQuery.queryKey].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )
      await navigate({ to: '/p/$key', params: { key: project.key } })
    },
  })
  const failure = hasStatus(join.error, 410)
    ? `${join.error?.message} ${ASK_AGAIN}`
    : hasStatus(join.error, 404)
      ? UNKNOWN
      : join.error?.message

  return (
    <div className='grid gap-3'>
      <RootError message={failure} />
      <Button
        className='h-11'
        disabled={join.isPending}
        onClick={() => join.mutate()}
      >
        {join.isPending && <Loader2 className='animate-spin' />}
        Join project
      </Button>
    </div>
  )
}

/** What the link offers (project, role, inviter, expiry), then the one action; a dead link says why. */
export const JoinProject = ({ token }: { token: string }) => {
  const { data: invite, error } = useQuery(invitePreviewQuery(token))
  if (error)
    return (
      <RootError
        message={
          hasStatus(error, 410)
            ? `${error.message} ${ASK_AGAIN}`
            : hasStatus(error, 409)
              ? error.message
              : UNKNOWN
        }
      />
    )
  if (!invite) return <Skeleton className='h-36 w-full' />

  return (
    <div className='grid gap-4'>
      <section aria-label='Invite'>
        <p className='text-lg font-semibold'>{invite.project_name}</p>
        <dl className='divide-y text-sm'>
          <Row label='Role'>{ROLE_LABEL[invite.role]}</Row>
          <Row label='Invited by'>{invite.inviter_name}</Row>
          <Row label='Expires'>
            {new Date(invite.expires_at).toLocaleDateString(undefined, {
              dateStyle: 'medium',
            })}
          </Row>
        </dl>
        {invite.max_uses > 1 && (
          <p className='pt-2 text-sm text-muted-foreground'>
            {invite.spots_left} of {invite.max_uses} spots left
          </p>
        )}
      </section>
      <JoinButton token={token} />
    </div>
  )
}
