import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type BoardSettings,
  type Issue,
  api,
  dataOrThrow,
} from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'
import { backlogKey } from './backlog-query'
import { boardSettingsQuery, boardsKey, issueNumber } from './board-query'
import { issuesKey, subtasksQuery } from './issue-queries'
import { statusesById } from './statuses'

/** SB-22: a subtask left a not-done status and now every subtask of its parent is done. */
export const closesLastSubtask = (
  from: number,
  subtasksAfter: Pick<Issue, 'status_id'>[],
  settings: BoardSettings | undefined
) => {
  const statuses = statusesById(settings)
  const done = (statusId: number) => statuses.get(statusId)?.category === 'done'
  return (
    !done(from) &&
    subtasksAfter.length > 0 &&
    subtasksAfter.every((subtask) => done(subtask.status_id))
  )
}

export const firstDoneStatus = (settings: BoardSettings | undefined) =>
  settings?.columns
    .flatMap((column) => column.statuses)
    .find((status) => status.category === 'done')

type Finish = { parentKey: string; statusId: number; name: string }

/** D57: after a subtask's status change, offers once to move its parent to the board's first done status. */
export const useOfferToFinishParent = (projectKey: string) => {
  const queryClient = useQueryClient()
  const finish = useMutation({
    mutationFn: async ({ parentKey, statusId }: Finish) =>
      dataOrThrow(
        await api.POST('/api/projects/{key}/issues/{number}/move', {
          params: {
            path: { key: projectKey, number: issueNumber(parentKey) },
          },
          body: { status_id: statusId },
        })
      ),
    onSuccess: (_, { parentKey, name }) =>
      toast.success(`${parentKey} moved to ${name}.`),
    onError: (error, { parentKey }) =>
      toast.error(`Could not move ${parentKey}.`, {
        description: error.message,
      }),
    onSettled: () =>
      Promise.all(
        [
          boardsKey(projectKey),
          backlogKey(projectKey),
          issuesKey(projectKey),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      ),
  })

  /** Only a subtask entering done asks the server for its siblings. */
  return async (parentKey: string, from: number, to: number) => {
    const settings = await queryClient.ensureQueryData(
      boardSettingsQuery(projectKey)
    )
    const done = firstDoneStatus(settings)
    const category = (statusId: number) =>
      statusesById(settings).get(statusId)?.category
    if (!done || category(to) !== 'done' || category(from) === 'done') return
    const subtasks = await queryClient.fetchQuery({
      ...subtasksQuery(projectKey, parentKey),
      staleTime: 0,
    })
    if (!closesLastSubtask(from, subtasks, settings)) return
    // One toast per parent: a second finish replaces it.
    toast.success(`All subtasks are done. Move ${parentKey} to ${done.name}?`, {
      id: `finish-${parentKey}`,
      action: {
        label: 'Move',
        onClick: () =>
          finish.mutate({ parentKey, statusId: done.id, name: done.name }),
      },
    })
  }
}
