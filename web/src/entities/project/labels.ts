import type { BoardType, ImportSource, MemberRole } from '@/shared/api/client'

export const BOARD_TYPE_LABEL = {
  scrum: 'Scrum',
  kanban: 'Kanban',
} satisfies Record<BoardType, string>

export const ROLE_LABEL = {
  admin: 'Admin',
  member: 'Member',
} satisfies Record<MemberRole, string>

export const IMPORT_SOURCE_LABEL = {
  jira: 'Jira',
  linear: 'Linear',
} satisfies Record<ImportSource, string>
