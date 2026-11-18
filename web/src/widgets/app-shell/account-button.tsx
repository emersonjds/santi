import type { ComponentProps } from 'react'
import { useRouteContext } from '@tanstack/react-router'
import { UserAvatar } from '@/entities/user/user-avatar'
import { useT } from '@/shared/i18n/i18n'
import { fullName } from '@/shared/lib/initials'
import { Button } from '@/shared/ui/button'
import { messages } from './messages'

export const AccountButton = (props: ComponentProps<typeof Button>) => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const t = useT(messages)

  return (
    <Button
      variant='ghost'
      aria-label={t('accountOf', { name: fullName(user.display_name) })}
      className='size-11 shrink-0 rounded-full p-0 md:size-9'
      {...props}
    >
      <UserAvatar name={user.display_name} />
    </Button>
  )
}
