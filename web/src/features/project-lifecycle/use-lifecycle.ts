import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { projectQuery } from '@/entities/project/project-queries'
import { api, okOrThrow } from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'

export type LifecycleAction =
  'archive' | 'unarchive' | 'trash' | 'restore' | 'purge'

const send = async (projectKey: string, action: LifecycleAction) => {
  const params = { path: { key: projectKey } }
  if (action === 'purge')
    return okOrThrow(await api.DELETE('/api/projects/{key}', { params }))
  okOrThrow(await api.POST(`/api/projects/{key}/${action}`, { params }))
}

/** The sidebar, the home and /projects list projects by state. */
const refresh = (queryClient: QueryClient) =>
  Promise.all(
    [['projects'], ['home']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  )

/** Archiving and trashing leave the project for /projects, with Undo for 8 s. */
const LEAVING: Partial<
  Record<LifecycleAction, { undo: LifecycleAction; done: string }>
> = {
  archive: { undo: 'unarchive', done: 'Archived {key}' },
  trash: { undo: 'restore', done: 'Moved {key} to trash' },
}

export const useLifecycle = (projectKey: string, action: LifecycleAction) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const leaving = LEAVING[action]

  return useMutation({
    mutationFn: () => send(projectKey, action),
    onSuccess: async () => {
      if (!leaving) return refresh(queryClient)
      await navigate({ to: '/projects' })
      queryClient.removeQueries({ queryKey: projectQuery(projectKey).queryKey })
      await refresh(queryClient)
      toast.success(leaving.done.replace('{key}', projectKey), {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: () =>
            void send(projectKey, leaving.undo).then(
              () => refresh(queryClient),
              (error: Error) => toast.error(error.message)
            ),
        },
      })
    },
  })
}
