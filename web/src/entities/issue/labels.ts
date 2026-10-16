import type { Priority } from '@/shared/api/client'

export const PRIORITY_LABEL = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} satisfies Record<Priority, string>
