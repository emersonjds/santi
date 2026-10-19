import { ApiError, type Problem } from '@/shared/api/client'
import type { paths } from '@/shared/api/schema'

type Upload = paths['/api/projects/{key}/issues/{number}/attachments']['post']
type Uploaded = Upload['responses'][201]['content']['application/json']

type UploadAttachmentOptions = {
  projectKey: string
  number: number
  file: File
  /** A comment of the issue the file belongs to (SAN-175). */
  commentId?: number
  /** From 0 to 1. */
  onProgress: (share: number) => void
  signal: AbortSignal
}

const isProblem = (body: unknown): body is Pick<Problem, 'detail' | 'errors'> =>
  typeof body === 'object' && body !== null && 'detail' in body

/** One file per request: fetch reports no upload progress, so this one call uses XMLHttpRequest (SAN-158). */
export const uploadAttachment = ({
  projectKey,
  number,
  file,
  commentId,
  onProgress,
  signal,
}: UploadAttachmentOptions) =>
  new Promise<Uploaded>((resolve, reject) => {
    const body = new FormData()
    body.append('file', file)
    if (commentId !== undefined) body.append('comment_id', String(commentId))
    const xhr = new XMLHttpRequest()
    xhr.open(
      'POST',
      `/api/projects/${encodeURIComponent(projectKey)}/issues/${number}/attachments`
    )
    xhr.withCredentials = true
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status === 201) return resolve(xhr.response)
      const answer: unknown = xhr.response
      reject(
        isProblem(answer)
          ? new ApiError(xhr.status, answer.detail, answer.errors)
          : new ApiError(
              xhr.status,
              xhr.status === 413
                ? 'Larger than 25 MB.'
                : 'Upload failed. Check your connection.'
            )
      )
    }
    xhr.onerror = () => reject(new TypeError('Network error'))
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort())
    xhr.send(body)
  })
