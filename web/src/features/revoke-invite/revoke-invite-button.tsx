import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invitesQuery } from '@/entities/invite/invite-queries'
import { api, hasStatus, okOrThrow } from '@/shared/api/client'
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

type RevokeInviteButtonProps = {
  projectKey: string
  inviteId: number
  /** The id of the row's summary, so each Revoke says which link it ends. */
  describedBy: string
}

/** SAN-177: a link that already ended (404) leaves the list like a revoked one. */
export const RevokeInviteButton = ({
  projectKey,
  inviteId,
  describedBy,
}: RevokeInviteButtonProps) => {
  const queryClient = useQueryClient()
  const { queryKey } = invitesQuery(projectKey)
  const revoke = useMutation({
    mutationFn: async () => {
      try {
        okOrThrow(
          await api.DELETE('/api/projects/{key}/invites/{id}', {
            params: { path: { key: projectKey, id: inviteId } },
          })
        )
        return true
      } catch (error) {
        if (hasStatus(error, 404)) return false
        throw error
      }
    },
    onSuccess: (revoked) => {
      queryClient.setQueryData(queryKey, (invites) =>
        invites?.filter((invite) => invite.id !== inviteId)
      )
      void queryClient.invalidateQueries({ queryKey, exact: true })
      if (revoked) toast.success('Link revoked.')
    },
  })

  return (
    <AlertDialog onOpenChange={(open) => open || revoke.reset()}>
      <AlertDialogTrigger asChild>
        <Button
          variant='outline'
          className='h-11 md:h-9'
          aria-describedby={describedBy}
        >
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
          <AlertDialogDescription>
            Nobody else can join with it. People who already joined stay in the
            project.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RootError message={revoke.error?.message} />
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11 md:h-9'>Cancel</AlertDialogCancel>
          <Button
            variant='destructive'
            className='h-11 md:h-9'
            disabled={revoke.isPending}
            onClick={() => revoke.mutate()}
          >
            Revoke link
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
