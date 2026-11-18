import { api, okOrThrow } from '@/shared/api/client'
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
import type { ExitProps } from './member-controls'
import { useMembersWrite } from './use-members-write'

/** Removing a member and leaving are the same write; leaving takes the caller home (lazy chunk). */
export const MemberExitDialog = ({
  projectKey,
  member,
  copy,
  open,
  onClose,
  onCloseAutoFocus,
}: Omit<ExitProps, 'locked' | 'open'> & {
  open: boolean
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
}) => {
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
        if (next) return
        remove.reset()
        onClose()
      }}
    >
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <RootError message={remove.error?.message} />
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11 md:h-9'>Cancel</AlertDialogCancel>
          <Button
            variant='destructive'
            className='h-11 md:h-9'
            disabled={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
          >
            {copy.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
