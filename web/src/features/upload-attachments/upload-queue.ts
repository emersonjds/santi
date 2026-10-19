import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { attachmentsQuery } from '@/entities/attachment/attachments'
import { uploadAttachment } from '@/entities/attachment/upload-attachment'
import { ApiError, fieldMessage } from '@/shared/api/client'

const MAX_BYTES = 25 * 1024 * 1024

/** SAN-158 decision 3, the server's allowlist. */
const EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'txt',
  'csv',
  'md',
  'zip',
]

/** For the file picker's `accept`. */
export const ACCEPTED = EXTENSIONS.map((extension) => `.${extension}`).join(',')

const refusalOf = (file: File) => {
  if (file.size > MAX_BYTES) return 'Larger than 25 MB.'
  const extension = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase()
  if (!extension || !EXTENSIONS.includes(extension))
    return 'This file type is not allowed.'
}

const reasonOf = (error: unknown) =>
  error instanceof ApiError
    ? fieldMessage(error)
    : 'Upload failed. Check your connection.'

export type Upload = {
  id: number
  number: number
  file: File
  /** From 0 to 1. */
  progress: number
  error?: string
  cancel?: () => void
}

let lastId = 0

/** Files on their way to an issue, one request each; a finished one leaves the queue for the list. */
export const useUploadQueue = (
  projectKey: string,
  number: number,
  commentId?: number
) => {
  const queryClient = useQueryClient()
  const [uploads, setUploads] = useState<Upload[]>([])

  const update = (id: number, change: Partial<Upload>) =>
    setUploads((list) =>
      list.map((upload) =>
        upload.id === id ? { ...upload, ...change } : upload
      )
    )
  const remove = ({ id }: Pick<Upload, 'id'>) =>
    setUploads((list) => list.filter((upload) => upload.id !== id))

  const start = ({ id, number: target, file }: Upload) => {
    const refusal = refusalOf(file)
    if (refusal) return update(id, { error: refusal, progress: 0 })
    const controller = new AbortController()
    update(id, {
      error: undefined,
      progress: 0,
      cancel: () => controller.abort(),
    })
    uploadAttachment({
      projectKey,
      number: target,
      file,
      commentId,
      signal: controller.signal,
      onProgress: (progress) => update(id, { progress }),
    }).then(
      () => {
        remove({ id })
        void queryClient.invalidateQueries({
          queryKey: attachmentsQuery(projectKey, target).queryKey,
        })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          update(id, { error: reasonOf(error), cancel: undefined })
      }
    )
  }

  const add = (files: Iterable<File>) => {
    const added = [...files].map((file) => ({
      id: ++lastId,
      number,
      file,
      progress: 0,
    }))
    setUploads((list) => [...list, ...added])
    added.forEach(start)
  }

  const cancel = (upload: Upload) => {
    upload.cancel?.()
    remove(upload)
  }

  return {
    uploads: uploads.filter((upload) => upload.number === number),
    add,
    retry: start,
    cancel,
    remove,
  }
}

export type UploadQueue = ReturnType<typeof useUploadQueue>
