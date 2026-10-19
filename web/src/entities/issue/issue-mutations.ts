import { useMutation, useQueryClient } from '@tanstack/react-query'
import { attachmentsQuery } from '@/entities/attachment/attachments'
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
  okOrThrow,
} from '@/shared/api/client'
import { useOptimisticWrite } from '@/shared/lib/optimistic-write'
import { toast } from '@/shared/lib/toast'
import {
  type EpicChange,
  type RowMove,
  insertRow,
  moveRow,
  patchRow,
  removeRow,
  setEpic,
} from './backlog-cache'
import { backlogKey } from './backlog-query'
import {
  type Move,
  cardOf,
  insertCard,
  moveCard,
  patchCard,
  placeCard,
  removeCard,
} from './board-cache'
import {
  boardSettingsQuery,
  boardsKey,
  epicsQuery,
  issueNumber,
} from './board-query'
import {
  commentsQuery,
  issueQuery,
  issuesKey,
  subtasksQuery,
} from './issue-queries'
import { statusesOf } from './statuses'

const useBoardWrite = <Variables>(
  projectKey: string,
  write: (variables: Variables) => Promise<unknown>,
  change: (board: BoardView, variables: Variables) => BoardView,
  failure: (variables: Variables) => string
) =>
  useOptimisticWrite({
    queryKey: boardsKey(projectKey),
    refresh: [backlogKey(projectKey), issuesKey(projectKey)],
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
  return useBoardWrite<Move>(
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
    refresh: [boardsKey(projectKey), issuesKey(projectKey)],
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

/** D40: the issue leaves every board and the backlog at once, and comes back if the server refuses. */
export const useDeleteIssue = (projectKey: string) => {
  const queryClient = useQueryClient()
  const boards = boardsKey(projectKey)
  const backlog = backlogKey(projectKey)
  return useMutation({
    mutationFn: async (key: string) =>
      okOrThrow(
        await api.DELETE('/api/projects/{key}/issues/{number}', {
          params: { path: { key: projectKey, number: issueNumber(key) } },
        })
      ),
    onMutate: async (key) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: boards }),
        queryClient.cancelQueries({ queryKey: backlog }),
      ])
      const before = [
        ...queryClient.getQueriesData<BoardView>({ queryKey: boards }),
        ...queryClient.getQueriesData<Backlog>({ queryKey: backlog }),
      ]
      queryClient.setQueriesData<BoardView>(
        { queryKey: boards },
        (board) => board && removeCard(board, key)
      )
      queryClient.setQueriesData<Backlog>(
        { queryKey: backlog },
        (view) => view && removeRow(view, key)
      )
      return before
    },
    onError: (error, key, before) => {
      for (const [queryKey, view] of before ?? [])
        queryClient.setQueryData(queryKey, view && { ...view })
      toast.error(`Couldn't delete ${key}`, { description: error.message })
    },
    onSuccess: (_, key) => {
      queryClient.removeQueries({
        queryKey: issueQuery(projectKey, issueNumber(key)).queryKey,
        exact: true,
      })
      toast.success(`${key} deleted`)
    },
    onSettled: () =>
      Promise.all(
        [
          boards,
          backlog,
          epicsQuery(projectKey).queryKey,
          issuesKey(projectKey),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      ),
  })
}

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
  authorId: number,
  authorName: string
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
      const draft: Comment = {
        id: -Date.now(),
        author_id: authorId,
        author_name: authorName,
        body,
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData(queryKey, (old = []) => [...old, draft])
      return draft.id
    },
    onError: (error, _body, draftId) => {
      queryClient.setQueryData(queryKey, (old) =>
        old?.filter((comment) => comment.id !== draftId)
      )
      toast.error("Couldn't add the comment", { description: error.message })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

/** SAN-136: the edit waits for the server (D50 amendment); the editor stays open on an error. */
export const useEditComment = (projectKey: string, number: number) => {
  const queryClient = useQueryClient()
  const { queryKey } = commentsQuery(projectKey, number)
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) =>
      dataOrThrow(
        await api.PATCH('/api/projects/{key}/issues/{number}/comments/{id}', {
          params: { path: { key: projectKey, number, id } },
          body: { body },
        })
      ),
    onSuccess: (saved) =>
      queryClient.setQueryData(queryKey, (old) =>
        old?.map((comment) => (comment.id === saved.id ? saved : comment))
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

/** Takes the comment out at once; puts it back if the server refuses. */
export const useDeleteComment = (projectKey: string, number: number) => {
  const queryClient = useQueryClient()
  const { queryKey } = commentsQuery(projectKey, number)
  return useMutation({
    mutationFn: async (id: number) =>
      okOrThrow(
        await api.DELETE('/api/projects/{key}/issues/{number}/comments/{id}', {
          params: { path: { key: projectKey, number, id } },
        })
      ),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey })
      const before = queryClient.getQueryData(queryKey) ?? []
      const index = before.findIndex((comment) => comment.id === id)
      queryClient.setQueryData(queryKey, (old) =>
        old?.filter((comment) => comment.id !== id)
      )
      return { removed: before.find((comment) => comment.id === id), index }
    },
    onError: (error, id, taken) => {
      // Only this comment comes back: another write may have changed the list since.
      const removed = taken?.removed
      queryClient.setQueryData(queryKey, (old) =>
        old && removed && !old.some((comment) => comment.id === id)
          ? [...old.slice(0, taken.index), removed, ...old.slice(taken.index)]
          : old
      )
      toast.error("Couldn't delete the comment", {
        description: error.message,
      })
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: attachmentsQuery(projectKey, number).queryKey,
      }),
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
      if (created.issue_type === 'epic')
        void queryClient.invalidateQueries({
          queryKey: epicsQuery(projectKey).queryKey,
        })
    },
  })
}
