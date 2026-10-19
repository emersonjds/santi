import { useSyncExternalStore } from 'react'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
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

/** Why the file cannot go, found before sending it. */
export const refusalOf = (file: File) => {
  if (file.size > MAX_BYTES) return 'Larger than 25 MB.'
  const extension = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase()
  if (!extension || !EXTENSIONS.includes(extension))
    return 'This file type is not allowed.'
}

const reasonOf = (error: unknown) =>
  error instanceof ApiError
    ? fieldMessage(error)
    : 'Upload failed. Check your connection.'

type Target = {
  projectKey: string
  number: number
  /** A comment of the issue the file belongs to (SAN-175). */
  commentId?: number
}

export type Upload = Target & {
  id: number
  file: File
  /** From 0 to 1. */
  progress: number
  error?: string
  cancel?: () => void
}

let uploads: Upload[] = []
let lastId = 0
const listeners = new Set<() => void>()

const set = (change: (list: Upload[]) => Upload[]) => {
  uploads = change(uploads)
  listeners.forEach((listener) => listener())
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
const update = (id: number, change: Partial<Upload>) =>
  set((list) =>
    list.map((upload) => (upload.id === id ? { ...upload, ...change } : upload))
  )
const remove = ({ id }: Pick<Upload, 'id'>) =>
  set((list) => list.filter((upload) => upload.id !== id))

const start = (queryClient: QueryClient, upload: Upload) => {
  const { id, projectKey, number, commentId, file } = upload
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
    number,
    file,
    commentId,
    signal: controller.signal,
    onProgress: (progress) => update(id, { progress }),
  }).then(
    () => {
      remove({ id })
      void queryClient.invalidateQueries({
        queryKey: attachmentsQuery(projectKey, number).queryKey,
      })
    },
    (error: unknown) => {
      if (!controller.signal.aborted)
        update(id, { error: reasonOf(error), cancel: undefined })
    }
  )
}

/** Sends each file to the issue, or to one of its comments, one request each. */
export const enqueueUploads = (
  queryClient: QueryClient,
  target: Target,
  files: Iterable<File>
) => {
  const added = [...files].map((file) => ({
    ...target,
    id: ++lastId,
    file,
    progress: 0,
  }))
  set((list) => [...list, ...added])
  added.forEach((upload) => start(queryClient, upload))
}

const cancel = (upload: Upload) => {
  upload.cancel?.()
  remove(upload)
}

/** Stops every upload and forgets them all: the next account must not see them. */
export const resetUploads = () => {
  uploads.forEach((upload) => upload.cancel?.())
  set(() => [])
}

/** The files on their way to an issue, or to one of its comments; a finished one leaves for the list. */
export const useUploadQueue = (
  projectKey: string,
  number: number,
  commentId?: number
) => {
  const queryClient = useQueryClient()
  const all = useSyncExternalStore(subscribe, () => uploads)
  return {
    uploads: all.filter(
      (upload) =>
        upload.projectKey === projectKey &&
        upload.number === number &&
        upload.commentId === commentId
    ),
    add: (files: Iterable<File>) =>
      enqueueUploads(queryClient, { projectKey, number, commentId }, files),
    retry: (upload: Upload) => start(queryClient, upload),
    cancel,
    remove,
  }
}

export type UploadQueue = ReturnType<typeof useUploadQueue>
