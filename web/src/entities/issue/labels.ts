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
  Object.hasOwn(PRIORITY_LABEL, value)

export const isIssueType = (value: string): value is IssueType =>
  Object.hasOwn(TYPE_LABEL, value)

export const issueCount = (count: number) =>
  `${count} ${count === 1 ? 'issue' : 'issues'}`
