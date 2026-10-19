import { X } from 'lucide-react'
import { fileSize } from '@/entities/attachment/attachments'
import { Button } from '@/shared/ui/button'
import { refusalOf } from './upload-queue'

type PendingFilesProps = {
  files: File[]
  onRemove: (index: number) => void
}

/** SAN-175: files picked for a comment or a new issue, sent once it is saved. */
export const PendingFiles = ({ files, onRemove }: PendingFilesProps) =>
  files.length > 0 && (
    <ul aria-label='Files to attach' className='flex flex-wrap gap-2'>
      {files.map((file, index) => (
        <li
          key={index}
          className='flex max-w-full min-w-0 items-center gap-x-1.5 rounded-md border ps-3 text-sm'
        >
          <span className='min-w-0 truncate'>{file.name}</span>
          <span className='shrink-0 text-xs text-subtle-foreground tabular-nums'>
            {fileSize(file.size)}
          </span>
          {refusalOf(file) && (
            <span className='text-xs text-destructive'>{refusalOf(file)}</span>
          )}
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='size-11 shrink-0 md:size-8'
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(index)}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  )
