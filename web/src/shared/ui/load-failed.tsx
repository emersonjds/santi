import { useT } from '@/shared/i18n/i18n'
import { Button } from './button'
import { messages } from './messages'

export const LoadFailed = ({
  message,
  onRetry,
  action,
}: {
  message: string
  onRetry: () => void
  action?: string
}) => {
  const t = useT(messages)
  return (
    <div
      role='alert'
      className='flex items-center justify-between gap-4 rounded-md border px-4 py-3 text-sm'
    >
      {message}
      <Button variant='outline' className='h-11 md:h-9' onClick={onRetry}>
        {action ?? t('retry')}
      </Button>
    </div>
  )
}
