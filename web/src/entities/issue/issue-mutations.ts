import { useQueryClient } from '@tanstack/react-query'
import { peopleQuery } from '@/entities/project/project-queries'
import {
  type Backlog,
  type BoardSettings,
  type BoardView,
  type Card,
  type Issue,
  type UpdateIssue,
  api,
  dataOrThrow,
} from '@/shared/api/client'
import { useOptimisticWrite } from '@/shared/lib/optimistic-write'
import {
  type EpicChange,
  type RowMove,
  moveRow,
  patchRow,
  setEpic,
} from './backlog-cache'
import { backlogKey } from './backlog-query'
import { type Move, moveCard, patchCard } from './board-cache'
import { boardSettingsQuery, boardsKey, issueNumber } from './board-query'
import { issuesKey } from './issue-queries'
import { statusesOf } from './statuses'

const useBoardWrite = <Variables, Result = unknown>(
  projectKey: string,
  write: (variables: Variables) => Promise<Result>,
  change: (board: BoardView, variables: Variables) => BoardView,
  failure: (variables: Variables) => string
) =>
  useOptimisticWrite({
    queryKey: boardsKey(projectKey),
    refresh: [
      backlogKey(projectKey),
      issuesKey(projectKey),
      peopleQuery(projectKey).queryKey,
    ],
    write,
    change,
    failure,
  })

/** BL-13: a row dragged or sent within or across backlog sections; the sprint goes only when it changes. */
export const useMoveRow = (projectKey: string) =>
  useOptimisticWrite<Backlog, RowMove>({
    queryKey: backlogKey(projectKey),
    refresh: [boardsKey(projectKey)],
    write: async ({ card, toSprintId, after, before }) =>
      dataOrThrow(
        await api.POST('/api/projects/{key}/issues/{number}/move', {
          params: { path: { key: projectKey, number: issueNumber(card.key) } },
          body:
            (card.sprint_id ?? null) === toSprintId
              ? { after, before }
              : { sprint_id: toSprintId, after, before },
        })
      ),
    change: moveRow,
    failure: ({ card }) => `Couldn't move ${card.key}`,
  })

/** BL-20: a row dropped on an epic in the panel, or given one from its menu; `null` clears it. */
export const useSetEpic = (projectKey: string) =>
  useOptimisticWrite<Backlog, EpicChange>({
    queryKey: backlogKey(projectKey),
    refresh: [boardsKey(projectKey)],
    write: async ({ card, epic }) =>
      dataOrThrow(
        await api.PATCH('/api/projects/{key}/issues/{number}', {
          params: { path: { key: projectKey, number: issueNumber(card.key) } },
          body: { parent: epic },
        })
      ),
    change: setEpic,
    failure: ({ card }) => `Couldn't set the epic of ${card.key}`,
  })

/** The card keeps its status when the column holds it, else takes the column's first one. */
const statusFor = (
  settings: BoardSettings,
  columnId: number,
  current: number
) => {
  const statuses = statusesOf(settings, columnId)
  if (statuses.some((status) => status.id === current)) return undefined
  if (!statuses[0])
    throw new Error('Map a status to this column before moving issues into it.')
  return statuses[0].id
}

export const useMoveIssue = (projectKey: string) => {
  const queryClient = useQueryClient()
  return useBoardWrite<Move, Issue>(
    projectKey,
    async ({ card, toColumnId, after, before, statusId }) => {
      const status_id =
        statusId ??
        (card.column_id === toColumnId
          ? undefined
          : statusFor(
              await queryClient.ensureQueryData(boardSettingsQuery(projectKey)),
              toColumnId,
              card.status_id
            ))
      return dataOrThrow(
        await api.POST('/api/projects/{key}/issues/{number}/move', {
          params: { path: { key: projectKey, number: issueNumber(card.key) } },
          body: { status_id, after, before },
        })
      )
    },
    moveCard,
    ({ card }) => `Couldn't move ${card.key}`
  )
}

export type CardUpdate = {
  card: Card
  change: UpdateIssue
  shown: Partial<Card>
}

export const useUpdateIssue = (projectKey: string) =>
  useBoardWrite<CardUpdate>(
    projectKey,
    async ({ card, change }) =>
      dataOrThrow(
        await api.PATCH('/api/projects/{key}/issues/{number}', {
          params: { path: { key: projectKey, number: issueNumber(card.key) } },
          body: change,
        })
      ),
    (board, { card, shown }) => patchCard(board, card.key, shown),
    ({ card }) => `Couldn't update ${card.key}`
  )

/** BL-19: a field edited on a backlog row, shown at once and taken back if the server refuses. */
export const useUpdateRow = (projectKey: string) =>
  useOptimisticWrite<Backlog, CardUpdate>({
    queryKey: backlogKey(projectKey),
    refresh: [
      boardsKey(projectKey),
      issuesKey(projectKey),
      peopleQuery(projectKey).queryKey,
    ],
    write: async ({ card, change }) =>
      dataOrThrow(
        await api.PATCH('/api/projects/{key}/issues/{number}', {
          params: { path: { key: projectKey, number: issueNumber(card.key) } },
          body: change,
        })
      ),
    change: (backlog, { card, shown }) => patchRow(backlog, card.key, shown),
    failure: ({ card }) => `Couldn't update ${card.key}`,
  })
