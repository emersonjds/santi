import { useDeleteComment } from '@/entities/issue/issue-mutations'
import { useReturnFocus } from '@/shared/lib/use-return-focus'
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

type DeleteCommentDialogProps = {
  projectKey: string
  number: number
  commentId: number
  onClose: () => void
}

/** SAN-136 (ED-36): confirm, then the delete is optimistic (lazy chunk). */
export const DeleteCommentDialog = ({
  projectKey,
  number,
  commentId,
  onClose,
}: DeleteCommentDialogProps) => {
  const remove = useDeleteComment(projectKey, number)
  const returnFocus = useReturnFocus()

  const confirm = () => {
    remove.mutate(commentId)
    onClose()
  }

  return (
    <AlertDialog open onOpenChange={(open) => open || onClose()}>
      <AlertDialogContent onCloseAutoFocus={returnFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
          <AlertDialogDescription>
            It can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11 md:h-9'>Cancel</AlertDialogCancel>
          <Button
            variant='destructive'
            className='h-11 md:h-9'
            onClick={confirm}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
