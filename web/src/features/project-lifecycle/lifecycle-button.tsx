import type { ComponentProps } from 'react'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'
import { type LifecycleAction, useLifecycle } from './use-lifecycle'

type LifecycleButtonProps = ComponentProps<typeof Button> & {
  projectKey: string
  action: LifecycleAction
}

/** One click, no confirm: unarchive and restore are their own undo. */
export const LifecycleButton = ({
  projectKey,
  action,
  ...props
}: LifecycleButtonProps) => {
  const change = useLifecycle(projectKey, action)
  return (
    <Button
      variant='outline'
      className='h-11 md:h-9'
      disabled={change.isPending}
      onClick={() =>
        change.mutate(undefined, {
          onError: (error) => toast.error(error.message),
        })
      }
      {...props}
    />
  )
}
