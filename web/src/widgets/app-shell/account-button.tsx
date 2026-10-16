import type { ComponentProps } from 'react'
import { useRouteContext } from '@tanstack/react-router'
import { UserAvatar } from '@/entities/user/user-avatar'
import { Button } from '@/shared/ui/button'

export const AccountButton = (props: ComponentProps<typeof Button>) => {
  const { user } = useRouteContext({ from: '/_authenticated' })

  return (
    <Button
      variant='ghost'
      aria-label={`Account (${user.display_name})`}
      className='size-11 shrink-0 rounded-full p-0 md:size-9'
      {...props}
    >
      <UserAvatar name={user.display_name} />
    </Button>
  )
}
