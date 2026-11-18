import { type RefObject, useRef } from 'react'
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
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { RootError } from '@/shared/ui/root-error'

export type RevokeInviteProps = {
  projectKey: string
  inviteId: number
  /** Where the focus goes once the row, and this button, are gone. */
  nextFocus: () => HTMLElement | null
}

/** SAN-177: a link that already ended (404) leaves the list like a revoked one (lazy chunk). */
export const RevokeInviteDialog = ({
  projectKey,
  inviteId,
  nextFocus,
  opener,
  onClose,
}: RevokeInviteProps & {
  opener: RefObject<HTMLButtonElement | null>
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const after = useRef<HTMLElement | null>(null)
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
      after.current = nextFocus()
      queryClient.setQueryData(queryKey, (invites) =>
        invites?.filter((invite) => invite.id !== inviteId)
      )
      void queryClient.invalidateQueries({ queryKey, exact: true })
      if (revoked) toast.success('Link revoked.')
    },
  })

  return (
    <AlertDialog open onOpenChange={(open) => open || onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const target = after.current ?? opener.current
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
      >
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
