import type { ComponentProps } from 'react'
import { useSignedInUser } from '@/entities/session/use-signed-in-user'
import { UserAvatar } from '@/entities/user/user-avatar'
import { fullName } from '@/shared/lib/initials'
import { Button } from '@/shared/ui/button'

export const AccountButton = (props: ComponentProps<typeof Button>) => {
  const user = useSignedInUser()

  return (
    <Button
      variant='ghost'
      aria-label={`Account (${fullName(user.display_name)})`}
      className='size-11 shrink-0 rounded-full p-0 md:size-9'
      {...props}
    >
      <UserAvatar name={user.display_name} />
    </Button>
  )
}
