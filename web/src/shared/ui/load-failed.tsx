import { Button } from './button'

export const LoadFailed = ({
  message,
  onRetry,
  action = 'Retry',
}: {
  message: string
  onRetry: () => void
  action?: string
}) => (
  <div
    role='alert'
    className='flex items-center justify-between gap-4 rounded-md border px-4 py-3 text-sm'
  >
    {message}
    <Button variant='outline' className='h-11 md:h-9' onClick={onRetry}>
      {action}
    </Button>
  </div>
)
