import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  type BoardSettings,
  type BoardView,
  type Card,
  type UpdateIssue,
  api,
  dataOrThrow,
} from '@/shared/api/client'
import { type Move, moveCard, patchCard } from './board-cache'
import { boardSettingsQuery, boardsKey, issueNumber } from './board-query'

/**
 * D37 optimistic write: patch every board cache of the project, roll back and
 * toast the problem on failure, refetch once settled.
 */
const useBoardWrite = <Variables>(
  projectKey: string,
  write: (variables: Variables) => Promise<unknown>,
  change: (board: BoardView, variables: Variables) => BoardView,
  failure: (variables: Variables) => string
) => {
  const queryClient = useQueryClient()
  const queryKey = boardsKey(projectKey)
  return useMutation({
    mutationFn: write,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueriesData<BoardView>({ queryKey })
      queryClient.setQueriesData<BoardView>(
        { queryKey },
        (board) => board && change(board, variables)
      )
      return snapshot
    },
    onError: (error, variables, snapshot) => {
      // A fresh object: the drag layer drops its pending order once the board it was made for changes.
      for (const [key, board] of snapshot ?? [])
        queryClient.setQueryData(key, board && { ...board })
      toast.error(failure(variables), { description: error.message })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

/** The card keeps its status when the column holds it, else takes the column's first one. */
const statusFor = (
  settings: BoardSettings,
  columnId: number,
  current: number
) => {
  const statuses =
    settings.columns.find((column) => column.id === columnId)?.statuses ?? []
  if (statuses.some((status) => status.id === current)) return undefined
  if (!statuses[0])
    throw new Error('Map a status to this column before moving issues into it.')
  return statuses[0].id
}

export const useMoveIssue = (projectKey: string) => {
  const queryClient = useQueryClient()
  return useBoardWrite<Move>(
    projectKey,
    async ({ card, toColumnId, after, before }) => {
      const status_id =
        card.column_id === toColumnId
          ? undefined
          : statusFor(
              await queryClient.ensureQueryData(boardSettingsQuery(projectKey)),
              toColumnId,
              card.status_id
            )
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

type Update = { card: Card; change: UpdateIssue; shown: Partial<Card> }

export const useUpdateIssue = (projectKey: string) =>
  useBoardWrite<Update>(
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
