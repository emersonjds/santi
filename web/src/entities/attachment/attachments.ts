import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { issuesKey } from '@/entities/issue/issue-queries'
import {
  type Attachment,
  api,
  dataOrThrow,
  okOrThrow,
} from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'

export const attachmentsQuery = (projectKey: string, number: number) =>
  queryOptions({
    queryKey: [...issuesKey(projectKey), number, 'attachments'],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/issues/{number}/attachments', {
          params: { path: { key: projectKey, number } },
        })
      ),
  })

/** The download URL; the server answers with the file or a redirect to it, images inline (D53). */
export const attachmentUrl = (
  projectKey: string,
  number: number,
  { id }: Pick<Attachment, 'id'>
) =>
  `/api/projects/${encodeURIComponent(projectKey)}/issues/${number}/attachments/${id}`

export const isImage = ({ content_type }: Pick<Attachment, 'content_type'>) =>
  content_type.startsWith('image/')

const UNITS = ['B', 'KB', 'MB']

/** "812 B", "1.2 KB", "2.4 MB", in steps of 1024 like the 25 MB limit. */
export const fileSize = (bytes: number) => {
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${Number(size.toFixed(1))} ${UNITS[unit]}`
}

export const useDeleteAttachment = (projectKey: string, number: number) => {
  const queryClient = useQueryClient()
  const { queryKey } = attachmentsQuery(projectKey, number)
  return useMutation({
    mutationFn: async (id: number) =>
      okOrThrow(
        await api.DELETE(
          '/api/projects/{key}/issues/{number}/attachments/{id}',
          { params: { path: { key: projectKey, number, id } } }
        )
      ),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey })
      const before = queryClient.getQueryData(queryKey) ?? []
      const index = before.findIndex((attachment) => attachment.id === id)
      queryClient.setQueryData(queryKey, (old) =>
        old?.filter((attachment) => attachment.id !== id)
      )
      return { removed: before[index], index }
    },
    onError: (error, id, taken) => {
      const removed = taken?.removed
      queryClient.setQueryData(queryKey, (old) =>
        old && removed && !old.some((attachment) => attachment.id === id)
          ? [...old.slice(0, taken.index), removed, ...old.slice(taken.index)]
          : old
      )
      toast.error("Couldn't delete the file", { description: error.message })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}
