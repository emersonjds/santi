import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type Backlog,
  type BoardSettings,
  type BoardView,
  type Card,
  type Comment,
  type CreateIssue,
  type Issue,
  type UpdateIssue,
  api,
  dataOrThrow,
} from '@/shared/api/client'
import { useOptimisticWrite } from '@/shared/lib/optimistic-write'
import { toast } from '@/shared/lib/toast'
import { type RowMove, insertRow, moveRow } from './backlog-cache'
import { backlogKey } from './backlog-query'
import {
  type Move,
  cardOf,
  insertCard,
  moveCard,
  patchCard,
  placeCard,
} from './board-cache'
import { boardSettingsQuery, boardsKey, issueNumber } from './board-query'
import { commentsQuery, issueQuery, subtasksQuery } from './issue-queries'

const useBoardWrite = <Variables>(
  projectKey: string,
  write: (variables: Variables) => Promise<unknown>,
  change: (board: BoardView, variables: Variables) => BoardView,
  failure: (variables: Variables) => string
) =>
  useOptimisticWrite({
    queryKey: boardsKey(projectKey),
    refresh: [backlogKey(projectKey)],
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

/** A status goes through the move API (D4 keeps the rank); every other field through PATCH. */
export type IssueChange = {
  change: UpdateIssue | { status_id: number }
  shown: Partial<Card> & { description?: string }
}

const isMove = (
  change: IssueChange['change']
): change is { status_id: number } => 'status_id' in change

const columnOf = (settings: BoardSettings | undefined, statusId?: number) =>
  settings?.columns.find((column) =>
    column.statuses.some((status) => status.id === statusId)
  )?.id

/** One field of the issue view: patches the issue and every board of the project at once (D37). */
export const useEditIssue = (projectKey: string, issue: Issue) => {
  const queryClient = useQueryClient()
  const issueKey = issueQuery(projectKey, issue.number).queryKey
  const boards = boardsKey(projectKey)
  const path = { key: projectKey, number: issue.number }

  return useMutation({
    mutationFn: async ({ change }: IssueChange) => {
      if (isMove(change))
        return dataOrThrow(
          await api.POST('/api/projects/{key}/issues/{number}/move', {
            params: { path },
            body: change,
          })
        )
      return dataOrThrow(
        await api.PATCH('/api/projects/{key}/issues/{number}', {
          params: { path },
          body: change,
        })
      )
    },
    onMutate: async ({ shown }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: issueKey, exact: true }),
        queryClient.cancelQueries({ queryKey: boards }),
      ])
      const before = {
        issue: queryClient.getQueryData(issueKey),
        boards: queryClient.getQueriesData<BoardView>({ queryKey: boards }),
      }
      const { description: _, ...card } = shown
      const column = columnOf(
        queryClient.getQueryData(boardSettingsQuery(projectKey).queryKey),
        shown.status_id
      )
      queryClient.setQueryData(issueKey, (old) => old && { ...old, ...shown })
      queryClient.setQueriesData<BoardView>(
        { queryKey: boards },
        (board) =>
          board &&
          placeCard(patchCard(board, issue.key, card), issue.key, column)
      )
      return before
    },
    onError: (error, _variables, before) => {
      queryClient.setQueryData(issueKey, before?.issue)
      for (const [key, board] of before?.boards ?? [])
        queryClient.setQueryData(key, board && { ...board })
      toast.error(`Couldn't update ${issue.key}`, {
        description: error.message,
      })
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: issueKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: boards }),
        queryClient.invalidateQueries({ queryKey: backlogKey(projectKey) }),
      ]),
  })
}

/** Shows the comment at once under the viewer's name; takes it back if the server refuses. */
export const useAddComment = (
  projectKey: string,
  number: number,
  authorId: number
) => {
  const queryClient = useQueryClient()
  const { queryKey } = commentsQuery(projectKey, number)
  return useMutation({
    mutationFn: async (body: string) =>
      dataOrThrow(
        await api.POST('/api/projects/{key}/issues/{number}/comments', {
          params: { path: { key: projectKey, number } },
          body: { body },
        })
      ),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey })
      const before = queryClient.getQueryData(queryKey)
      const draft: Comment = {
        id: -Date.now(),
        author_id: authorId,
        body,
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData(queryKey, (old = []) => [...old, draft])
      return before
    },
    onError: (error, _body, before) => {
      queryClient.setQueryData(queryKey, before)
      toast.error("Couldn't add the comment", { description: error.message })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export const useCreateIssue = (projectKey: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateIssue) =>
      dataOrThrow(
        await api.POST('/api/projects/{key}/issues', {
          params: { path: { key: projectKey } },
          body,
        })
      ),
    // Drawn from the server's answer, before the board refetch comes back.
    onSuccess: (created) => {
      if (created.parent_key)
        queryClient.setQueryData(
          subtasksQuery(projectKey, created.parent_key).queryKey,
          (old) => old && [...old, created]
        )
      const settings = queryClient.getQueryData(
        boardSettingsQuery(projectKey).queryKey
      )
      const columnId = (board?: BoardView) =>
        columnOf(settings, created.status_id) ?? board?.columns[0]?.id ?? 0
      queryClient.setQueriesData<BoardView>(
        { queryKey: boardsKey(projectKey) },
        (board) => board && insertCard(board, cardOf(created, columnId(board)))
      )
      queryClient.setQueriesData<Backlog>(
        { queryKey: backlogKey(projectKey) },
        (backlog) => backlog && insertRow(backlog, cardOf(created, columnId()))
      )
      void queryClient.invalidateQueries({ queryKey: boardsKey(projectKey) })
      void queryClient.invalidateQueries({ queryKey: backlogKey(projectKey) })
    },
  })
}
