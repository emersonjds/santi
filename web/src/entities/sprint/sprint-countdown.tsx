import { useState } from 'react'
import type { Sprint } from '@/shared/api/client'
import { timeLeft } from '@/shared/lib/sprint-dates'
import { useNow } from '@/shared/lib/use-now'

export const SprintCountdown = ({ sprint }: { sprint: Sprint }) => {
  const now = useNow()
  const [startedOverdue] = useState(
    () => !!sprint.ends_at && Date.parse(sprint.ends_at) <= Date.now()
  )
  if (!sprint.ends_at) return null
  const { overdue, text } = timeLeft(now, sprint.ends_at)
  return (
    <>
      <span
        role='timer'
        className={
          overdue
            ? 'rounded-full bg-warning-bg px-2 text-xs font-semibold text-warning'
            : undefined
        }
      >
        {text}
      </span>
      <span role='status' className='sr-only'>
        {overdue && !startedOverdue ? `${sprint.name} is overdue` : ''}
      </span>
    </>
  )
}
