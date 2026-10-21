import { Suspense, lazy, useState } from 'react'
import {
  Download,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Trash2,
} from 'lucide-react'
import {
  attachmentUrl,
  fileSize,
  isImage,
} from '@/entities/attachment/attachments'
import { commentTime, fullDateTime } from '@/entities/issue/comment-time'
import { useTimeZone } from '@/entities/session/use-time-zone'
import { PersonName } from '@/entities/user/user-avatar'
import type { Attachment } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'
import { Button, buttonVariants } from '@/shared/ui/button'

const AttachmentLightbox = lazy(() =>
  import('./attachment-lightbox').then((module) => ({
    default: module.AttachmentLightbox,
  }))
)

const ICONS = [
  [/zip/, FileArchive],
  [/sheet|csv/, FileSpreadsheet],
  [/pdf|text|document|presentation/, FileText],
] as const

const TypeIcon = ({ contentType }: { contentType: string }) => {
  const Icon = ICONS.find(([pattern]) => pattern.test(contentType))?.[1] ?? File
  return (
    <Icon
      aria-hidden='true'
      className='size-5 shrink-0 text-subtle-foreground'
    />
  )
}

type FileActionsProps = {
  attachment: Attachment
  url: string
  deletable: boolean
  onDelete: () => void
}

const FileActions = ({
  attachment,
  url,
  deletable,
  onDelete,
}: FileActionsProps) => (
  <span className='flex shrink-0 items-center'>
    <a
      href={`${url}?download=1`}
      download={attachment.file_name}
      aria-label={`Download ${attachment.file_name}`}
      className={buttonVariants({
        variant: 'ghost',
        size: 'icon',
        className: 'size-11 md:size-8',
      })}
    >
      <Download />
    </a>
    {deletable && (
      <Button
        variant='ghost'
        size='icon'
        className='size-11 md:size-8'
        aria-label={`Delete ${attachment.file_name}`}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    )}
  </span>
)

type AttachmentListProps = {
  projectKey: string
  number: number
  attachments: Attachment[]
  /** The uploader or a project admin (OR-28). */
  mayDelete: (attachment: Attachment) => boolean
  onDelete: (attachment: Attachment) => void
}

/** SAN-158 "List": images as a grid of tiles, other files as rows. */
export const AttachmentList = ({
  projectKey,
  number,
  attachments,
  mayDelete,
  onDelete,
}: AttachmentListProps) => {
  const [viewing, setViewing] = useState<number | null>(null)
  const timeZone = useTimeZone()
  const urlOf = (attachment: Attachment) =>
    attachmentUrl(projectKey, number, attachment)
  const images = attachments.filter(isImage)
  const files = attachments.filter((attachment) => !isImage(attachment))
  const actions = (attachment: Attachment) => (
    <FileActions
      attachment={attachment}
      url={urlOf(attachment)}
      deletable={mayDelete(attachment)}
      onDelete={() => onDelete(attachment)}
    />
  )

  return (
    <>
      {images.length > 0 && (
        <ul
          aria-label='Images'
          className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'
        >
          {images.map((image, index) => (
            <li
              key={image.id}
              className='group relative aspect-square overflow-hidden rounded-md border bg-muted'
            >
              <button
                type='button'
                className='size-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
                onClick={() => setViewing(index)}
              >
                <img
                  src={urlOf(image)}
                  alt={image.file_name}
                  loading='lazy'
                  className='size-full object-cover'
                />
              </button>
              <div
                className={cn(
                  'absolute inset-x-0 bottom-0 flex items-center bg-background/90 ps-2 text-xs transition-opacity duration-150',
                  'md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100'
                )}
              >
                <span
                  className='min-w-0 flex-1 truncate'
                  title={image.file_name}
                >
                  {image.file_name}
                  {image.comment_id != null && ' · in a comment'}
                </span>
                {actions(image)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul aria-label='Files' className='grid divide-y rounded-md border'>
          {files.map((attachment) => (
            <li
              key={attachment.id}
              className='flex min-h-11 items-center gap-3 py-1 ps-3 pe-1'
            >
              <TypeIcon contentType={attachment.content_type} />
              <div className='grid min-w-0 flex-1'>
                <span className='truncate text-sm' title={attachment.file_name}>
                  {attachment.file_name}
                </span>
                <span className='flex flex-wrap gap-x-1.5 text-xs text-subtle-foreground'>
                  <span className='tabular-nums'>
                    {fileSize(attachment.size_bytes)}
                  </span>
                  <span aria-hidden='true'>·</span>
                  <PersonName name={attachment.uploader_name} />
                  <span aria-hidden='true'>·</span>
                  <time
                    dateTime={attachment.created_at}
                    title={fullDateTime(attachment.created_at, timeZone)}
                  >
                    {commentTime(attachment.created_at, timeZone)}
                  </time>
                  {attachment.comment_id != null && (
                    <>
                      <span aria-hidden='true'>·</span>
                      <span>in a comment</span>
                    </>
                  )}
                </span>
              </div>
              {actions(attachment)}
            </li>
          ))}
        </ul>
      )}
      {viewing !== null && images.length > 0 && (
        <Suspense fallback={null}>
          <AttachmentLightbox
            images={images}
            index={Math.min(viewing, images.length - 1)}
            urlOf={urlOf}
            onIndex={setViewing}
            onClose={() => setViewing(null)}
          />
        </Suspense>
      )}
    </>
  )
}
