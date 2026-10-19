import { useRef } from 'react'
import { useDeleteAttachment } from '@/entities/attachment/attachments'
import type { Attachment } from '@/shared/api/client'
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

type DeleteAttachmentDialogProps = {
  projectKey: string
  number: number
  attachment: Attachment
  /** Where the focus goes once the file, and the control that opened this, are gone. */
  nextFocus: () => HTMLElement | null
  onClose: () => void
}

/** SAN-158 decision 10: confirm, then the delete is optimistic (lazy chunk). */
export const DeleteAttachmentDialog = ({
  projectKey,
  number,
  attachment,
  nextFocus,
  onClose,
}: DeleteAttachmentDialogProps) => {
  const remove = useDeleteAttachment(projectKey, number)
  const returnFocus = useReturnFocus()
  const after = useRef<HTMLElement | null>(null)

  const confirm = () => {
    after.current = nextFocus()
    remove.mutate(attachment.id)
    onClose()
  }

  return (
    <AlertDialog open onOpenChange={(open) => open || onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (!after.current) return returnFocus(event)
          event.preventDefault()
          after.current.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className='break-all'>
            {`Delete ${attachment.file_name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone.
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
