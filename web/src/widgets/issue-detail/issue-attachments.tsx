import { Suspense, lazy, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Paperclip } from 'lucide-react'
import {
  ACCEPTED,
  type UploadQueue,
} from '@/features/upload-attachments/upload-queue'
import { UploadRows } from '@/features/upload-attachments/upload-rows'
import { attachmentsQuery } from '@/entities/attachment/attachments'
import { mayDelete } from '@/entities/issue/may-delete'
import { projectQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import type { Attachment } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { LoadFailed } from '@/shared/ui/load-failed'
import { AttachmentList } from './attachment-list'

const DeleteAttachmentDialog = lazy(() =>
  import('@/features/delete-attachment/delete-attachment-dialog').then(
    (module) => ({ default: module.DeleteAttachmentDialog })
  )
)

type IssueAttachmentsProps = {
  projectKey: string
  number: number
  uploads: UploadQueue
}

/** SAN-158 decision 1: every file of the issue, comment files included, under the description. */
export const IssueAttachments = ({
  projectKey,
  number,
  uploads,
}: IssueAttachmentsProps) => {
  const list = useQuery(attachmentsQuery(projectKey, number))
  const { data: project } = useQuery(projectQuery(projectKey))
  const { data: me } = useQuery(sessionQuery)
  const [deleting, setDeleting] = useState<Attachment | null>(null)
  const attach = useRef<HTMLButtonElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const count = list.data?.length ?? 0

  return (
    <section aria-labelledby='issue-attachments' className='grid gap-2'>
      <div className='flex items-center gap-2'>
        <h3 id='issue-attachments' className='text-sm font-semibold'>
          {count ? `Attachments · ${count}` : 'Attachments'}
        </h3>
        <Button
          ref={attach}
          variant='ghost'
          className='ms-auto h-11 md:h-8'
          onClick={() => picker.current?.click()}
        >
          <Paperclip />
          Attach files
        </Button>
        <input
          ref={picker}
          type='file'
          multiple
          hidden
          accept={ACCEPTED}
          onChange={(event) => {
            uploads.add(event.target.files ?? [])
            event.target.value = ''
          }}
        />
      </div>
      {list.error && (
        <LoadFailed
          message="Couldn't load the attachments."
          onRetry={() => void list.refetch()}
        />
      )}
      <UploadRows queue={uploads} />
      {list.data?.length === 0 && uploads.uploads.length === 0 && (
        <p className='text-sm text-subtle-foreground'>No attachments yet.</p>
      )}
      {list.data && (
        <AttachmentList
          projectKey={projectKey}
          number={number}
          attachments={list.data}
          mayDelete={(attachment) =>
            mayDelete(project, me, attachment.uploader_id)
          }
          onDelete={setDeleting}
        />
      )}
      {deleting && (
        <Suspense fallback={null}>
          <DeleteAttachmentDialog
            projectKey={projectKey}
            number={number}
            attachment={deleting}
            nextFocus={() => attach.current}
            onClose={() => setDeleting(null)}
          />
        </Suspense>
      )}
    </section>
  )
}
