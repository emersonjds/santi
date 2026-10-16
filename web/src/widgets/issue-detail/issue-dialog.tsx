import { Link } from '@tanstack/react-router'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { IssueDetail } from './issue-detail'

type IssueDialogProps = {
  projectKey: string
  number: number
  onClose: () => void
}

/** IA §6: the issue over the board, max 960px; a full-screen sheet on a phone (IA §10). */
export const IssueDialog = ({
  projectKey,
  number,
  onClose,
}: IssueDialogProps) => (
  <Dialog open onOpenChange={(open) => open || onClose()}>
    <DialogContent
      aria-describedby={undefined}
      // Radix hears Esc on the document before any field does; a field marked `data-own-escape` keeps it.
      onEscapeKeyDown={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('[data-own-escape]')
        )
          event.preventDefault()
      }}
      className='max-h-[calc(100svh-4rem)] overflow-y-auto max-md:top-0 max-md:left-0 max-md:h-svh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 max-md:p-4 sm:max-w-[960px]'
    >
      <DialogTitle className='sr-only'>{`${projectKey}-${number}`}</DialogTitle>
      <div className='pe-8'>
        <IssueDetail
          projectKey={projectKey}
          number={number}
          actions={
            <Button asChild variant='ghost' className='h-11 md:h-8'>
              <Link
                to='/p/$key/issues/$number'
                params={{ key: projectKey, number: String(number) }}
              >
                <Maximize2 />
                Open as page
              </Link>
            </Button>
          }
        />
      </div>
    </DialogContent>
  </Dialog>
)
