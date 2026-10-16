import type { IssueType, Priority } from '@/shared/api/client'

export const PRIORITY_LABEL = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} satisfies Record<Priority, string>

export const TYPE_LABEL = {
  story: 'Story',
  task: 'Task',
  bug: 'Bug',
  epic: 'Epic',
  subtask: 'Subtask',
} satisfies Record<IssueType, string>

export const isPriority = (value: string): value is Priority =>
  value in PRIORITY_LABEL

export const isIssueType = (value: string): value is IssueType =>
  value in TYPE_LABEL

/** `1 issue`, `3 issues`. */
export const issueCount = (count: number) =>
  `${count} ${count === 1 ? 'issue' : 'issues'}`
