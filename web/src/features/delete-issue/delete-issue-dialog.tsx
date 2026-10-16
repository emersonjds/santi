import { useQuery } from '@tanstack/react-query'
import { issueNumber } from '@/entities/issue/board-query'
import { useDeleteIssue } from '@/entities/issue/issue-mutations'
import { commentsQuery, subtasksQuery } from '@/entities/issue/issue-queries'
import type { IssueType } from '@/shared/api/client'
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

const PARENTS = new Set<IssueType>(['story', 'task', 'bug'])

const counted = (count: number, word: string) =>
  count === 0 ? null : `${count} ${word}${count === 1 ? '' : 's'}`

type DeleteIssueDialogProps = {
  projectKey: string
  issueKey: string
  issueType: IssueType
  onClose: () => void
  /** Called right after the confirm: the issue view leaves the deleted issue. */
  onDeleted?: () => void
}

/** D40: names what goes with the issue before it goes (lazy chunk); the delete itself is optimistic. */
export const DeleteIssueDialog = ({
  projectKey,
  issueKey,
  issueType,
  onClose,
  onDeleted,
}: DeleteIssueDialogProps) => {
  const remove = useDeleteIssue(projectKey)
  const parent = PARENTS.has(issueType)
  const subtasks = useQuery({
    ...subtasksQuery(projectKey, issueKey),
    enabled: parent,
  })
  const comments = useQuery(commentsQuery(projectKey, issueNumber(issueKey)))
  const counting = comments.isPending || (parent && subtasks.isPending)
  const also = [
    counted(subtasks.data?.length ?? 0, 'subtask'),
    counted(comments.data?.length ?? 0, 'comment'),
  ]
    .filter(Boolean)
    .join(' and ')

  const confirm = () => {
    remove.mutate(issueKey)
    onClose()
    onDeleted?.()
  }

  return (
    <AlertDialog open onOpenChange={(open) => open || onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${issueKey}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            This can&apos;t be undone.
            {also && ` Also deleted: ${also}.`}
            {issueType === 'epic' && ' Its issues stay, without an epic.'}
            {counting && ' Counting what goes with it…'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11 md:h-9'>Cancel</AlertDialogCancel>
          <Button
            variant='destructive'
            className='h-11 md:h-9'
            disabled={counting}
            onClick={confirm}
          >
            Delete issue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
