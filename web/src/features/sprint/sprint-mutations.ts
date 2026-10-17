import { useMutation, useQueryClient } from '@tanstack/react-query'
import { backlogKey } from '@/entities/issue/backlog-query'
import { boardsKey } from '@/entities/issue/board-query'
import { sprintsQuery } from '@/entities/project/project-queries'
import {
  type CompleteSprint,
  type CreateSprint,
  type UpdateSprint,
  api,
  dataOrThrow,
  okOrThrow,
} from '@/shared/api/client'

type Of<Body> = Body & { id: number }

/** Waits for the server (its refusals show in the dialog), then refreshes every view a sprint shapes. */
const useSprintWrite = <Variables, Result>(
  projectKey: string,
  write: (variables: Variables) => Promise<Result>
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: write,
    onSuccess: () =>
      Promise.all(
        [
          backlogKey(projectKey),
          boardsKey(projectKey),
          sprintsQuery(projectKey).queryKey,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      ),
  })
}

export const useCreateSprint = (projectKey: string) =>
  useSprintWrite(projectKey, async (body: CreateSprint) =>
    dataOrThrow(
      await api.POST('/api/projects/{key}/sprints', {
        params: { path: { key: projectKey } },
        body,
      })
    )
  )

export const useUpdateSprint = (projectKey: string) =>
  useSprintWrite(projectKey, async ({ id, ...body }: Of<UpdateSprint>) =>
    dataOrThrow(
      await api.PUT('/api/projects/{key}/sprints/{id}', {
        params: { path: { key: projectKey, id } },
        body,
      })
    )
  )

export const useDeleteSprint = (projectKey: string) =>
  useSprintWrite(projectKey, async (id: number) =>
    okOrThrow(
      await api.DELETE('/api/projects/{key}/sprints/{id}', {
        params: { path: { key: projectKey, id } },
      })
    )
  )

/** SP-6: the start step confirms name, goal and times, then starts with those times and remembers the length (D48). */
export const useStartSprint = (projectKey: string) =>
  useSprintWrite(
    projectKey,
    async ({
      id,
      length,
      ...body
    }: Of<UpdateSprint> & { length: string | null }) => {
      const path = { key: projectKey, id }
      dataOrThrow(
        await api.PUT('/api/projects/{key}/sprints/{id}', {
          params: { path },
          body,
        })
      )
      return dataOrThrow(
        await api.POST('/api/projects/{key}/sprints/{id}/start', {
          params: { path },
          body: { starts_at: body.starts_at, ends_at: body.ends_at, length },
        })
      )
    }
  )

export const useCompleteSprint = (projectKey: string) =>
  useSprintWrite(projectKey, async ({ id, ...body }: Of<CompleteSprint>) =>
    dataOrThrow(
      await api.POST('/api/projects/{key}/sprints/{id}/complete', {
        params: { path: { key: projectKey, id } },
        body,
      })
    )
  )
