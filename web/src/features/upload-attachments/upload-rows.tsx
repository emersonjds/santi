import { fileSize } from '@/entities/attachment/attachments'
import { Button } from '@/shared/ui/button'
import type { UploadQueue } from './upload-queue'

/** SAN-158 "Uploading" and "Failed": one row per file, with its progress or its reason. */
export const UploadRows = ({ queue }: { queue: UploadQueue }) =>
  queue.uploads.length > 0 && (
    <ul aria-label='Uploads' className='grid divide-y rounded-md border'>
      {queue.uploads.map((upload) => (
        <li key={upload.id} className='grid gap-1.5 py-1 ps-3 pe-1'>
          <div className='flex min-h-11 flex-wrap items-center gap-x-2 md:min-h-8'>
            <span className='min-w-0 flex-1 truncate text-sm'>
              {upload.file.name}
            </span>
            <span className='text-xs text-subtle-foreground tabular-nums'>
              {fileSize(upload.file.size)}
            </span>
            {upload.error ? (
              <span className='flex'>
                <Button
                  variant='ghost'
                  className='h-11 md:h-8'
                  onClick={() => queue.retry(upload)}
                >
                  Retry
                </Button>
                <Button
                  variant='ghost'
                  className='h-11 md:h-8'
                  onClick={() => queue.remove(upload)}
                >
                  Remove
                </Button>
              </span>
            ) : (
              <Button
                variant='ghost'
                className='h-11 md:h-8'
                onClick={() => queue.cancel(upload)}
              >
                Cancel
              </Button>
            )}
          </div>
          {upload.error ? (
            <p role='alert' className='pe-2 pb-1 text-sm text-destructive'>
              {upload.error}
            </p>
          ) : (
            <progress
              aria-label={`Uploading ${upload.file.name}`}
              max={1}
              value={upload.progress}
              className='mb-2 h-1.5 w-[calc(100%-0.5rem)] accent-primary'
            />
          )}
        </li>
      ))}
    </ul>
  )
