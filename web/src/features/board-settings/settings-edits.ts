import { backlogKey } from '@/entities/issue/backlog-query'
import { boardSettingsQuery, boardsKey } from '@/entities/issue/board-query'
import type { Category, Status } from '@/entities/issue/statuses'
import {
  type BoardSettings,
  api,
  dataOrThrow,
  okOrThrow,
} from '@/shared/api/client'
import { useOptimisticWrite } from '@/shared/lib/optimistic-write'

export type Column = BoardSettings['columns'][number]

export type Edit =
  | { kind: 'add-column'; name: string; new_status: Category | null }
  | {
      kind: 'update-column'
      column: Column
      name: string
      wip_limit: number | null
    }
  | { kind: 'reorder-columns'; column_ids: number[] }
  | { kind: 'delete-column'; column: Column; move_statuses_to?: number }
  | { kind: 'add-status'; name: string; category: Category }
  | {
      kind: 'update-status'
      status: Status
      name: string
      column_id: number | null
    }
  | { kind: 'delete-status'; status: Status }
  | { kind: 'done-window'; done_window_days: number | null }

export type OnEdit = (edit: Edit) => void

const FAILURE: Record<Edit['kind'], string> = {
  'add-column': "Couldn't add the column",
  'update-column': "Couldn't save the column",
  'reorder-columns': "Couldn't reorder the columns",
  'delete-column': "Couldn't delete the column",
  'add-status': "Couldn't add the status",
  'update-status': "Couldn't save the status",
  'delete-status': "Couldn't delete the status",
  'done-window': "Couldn't change the done window",
}

/** Rows not saved yet carry a negative id; their controls wait for the server's. */
let lastPendingId = 0
const pendingId = () => --lastPendingId
export const isPending = (row: { id: number }) => row.id < 0

const allStatuses = (settings: BoardSettings) => [
  ...settings.columns.flatMap((column) => column.statuses),
  ...settings.unmapped,
]

const regroup = (
  settings: BoardSettings,
  statuses: Status[],
  columns = settings.columns
): BoardSettings => ({
  ...settings,
  columns: columns.map((column, position) => ({
    ...column,
    position,
    statuses: statuses.filter((status) => status.column_id === column.id),
  })),
  unmapped: statuses.filter((status) => status.column_id == null),
})

/** The settings as the server will answer once `edit` lands. */
export const applyEdit = (
  settings: BoardSettings,
  edit: Edit
): BoardSettings => {
  const statuses = allStatuses(settings)
  switch (edit.kind) {
    case 'add-column': {
      const id = pendingId()
      const column = {
        id,
        name: edit.name,
        position: 0,
        statuses: [],
        wip_limit: null,
      }
      const columns = [
        ...settings.columns.slice(0, -1),
        column,
        ...settings.columns.slice(-1),
      ]
      const status = edit.new_status && {
        id,
        name: edit.name,
        category: edit.new_status,
        column_id: id,
      }
      return regroup(
        settings,
        status ? [...statuses, status] : statuses,
        columns
      )
    }
    case 'update-column':
      return {
        ...settings,
        columns: settings.columns.map((column) =>
          column.id === edit.column.id
            ? { ...column, name: edit.name, wip_limit: edit.wip_limit }
            : column
        ),
      }
    case 'reorder-columns':
      return regroup(
        settings,
        statuses,
        edit.column_ids.flatMap(
          (id) => settings.columns.find((column) => column.id === id) ?? []
        )
      )
    case 'delete-column':
      return regroup(
        settings,
        statuses.map((status) =>
          status.column_id === edit.column.id
            ? { ...status, column_id: edit.move_statuses_to ?? null }
            : status
        ),
        settings.columns.filter((column) => column.id !== edit.column.id)
      )
    case 'add-status':
      return regroup(settings, [
        ...statuses,
        {
          id: pendingId(),
          name: edit.name,
          category: edit.category,
          column_id: null,
        },
      ])
    case 'update-status':
      return regroup(
        settings,
        statuses.map((status) =>
          status.id === edit.status.id
            ? { ...status, name: edit.name, column_id: edit.column_id }
            : status
        )
      )
    case 'delete-status':
      return regroup(
        settings,
        statuses.filter((status) => status.id !== edit.status.id)
      )
    case 'done-window':
      return { ...settings, done_window_days: edit.done_window_days }
  }
}

const send = async (key: string, edit: Edit) => {
  const project = { key }
  switch (edit.kind) {
    case 'add-column':
      return dataOrThrow(
        await api.POST('/api/projects/{key}/board/columns', {
          params: { path: project },
          body: { name: edit.name, new_status: edit.new_status },
        })
      )
    case 'update-column':
      return dataOrThrow(
        await api.PUT('/api/projects/{key}/board/columns/{id}', {
          params: { path: { key, id: edit.column.id } },
          body: { name: edit.name, wip_limit: edit.wip_limit },
        })
      )
    case 'reorder-columns':
      return dataOrThrow(
        await api.PUT('/api/projects/{key}/board/columns/order', {
          params: { path: project },
          body: { column_ids: edit.column_ids },
        })
      )
    case 'delete-column':
      return dataOrThrow(
        await api.DELETE('/api/projects/{key}/board/columns/{id}', {
          params: {
            path: { key, id: edit.column.id },
            query: { move_statuses_to: edit.move_statuses_to },
          },
        })
      )
    case 'add-status':
      return dataOrThrow(
        await api.POST('/api/projects/{key}/statuses', {
          params: { path: project },
          body: { name: edit.name, category: edit.category },
        })
      )
    case 'update-status':
      return dataOrThrow(
        await api.PUT('/api/projects/{key}/statuses/{id}', {
          params: { path: { key, id: edit.status.id } },
          body: { name: edit.name, column_id: edit.column_id },
        })
      )
    case 'delete-status':
      return okOrThrow(
        await api.DELETE('/api/projects/{key}/statuses/{id}', {
          params: { path: { key, id: edit.status.id } },
        })
      )
    case 'done-window':
      return dataOrThrow(
        await api.PUT('/api/projects/{key}/board/settings', {
          params: { path: project },
          body: { done_window_days: edit.done_window_days },
        })
      )
  }
}

/** Every settings change: shown at once, rolled back with a toast on refusal; board and backlog refetch. */
export const useSettingsEdit = (projectKey: string) =>
  useOptimisticWrite<BoardSettings, Edit>({
    queryKey: boardSettingsQuery(projectKey).queryKey,
    refresh: [boardsKey(projectKey), backlogKey(projectKey)],
    write: (edit) => send(projectKey, edit),
    change: applyEdit,
    failure: (edit) => FAILURE[edit.kind],
  })
