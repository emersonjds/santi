import { cn } from '@/shared/lib/utils'
import { CATEGORY, type Status } from './statuses'

export const StatusPill = ({ status }: { status: Status }) => {
  const { icon: Icon, tone } = CATEGORY[status.category]
  return (
    <span
      className={cn(
        'inline-flex max-w-32 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        tone
      )}
    >
      <Icon className='size-3.5 shrink-0' aria-hidden='true' />
      <span className='truncate'>{status.name}</span>
    </span>
  )
}
