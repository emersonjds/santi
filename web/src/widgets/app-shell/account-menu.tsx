import { useRef } from 'react'
import { Link, useRouteContext } from '@tanstack/react-router'
import {
  Compass,
  Keyboard,
  LogOut,
  MessageSquare,
  UserRound,
} from 'lucide-react'
import { useSignOut } from '@/features/auth/use-sign-out'
import { useT } from '@/shared/i18n/i18n'
import { fullName } from '@/shared/lib/initials'
import { FEEDBACK_URL } from '@/shared/lib/links'
import { openTour } from '@/shared/lib/tour'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { AccountButton } from './account-button'
import { messages } from './account-menu/messages'

export const AccountMenu = ({ onShortcuts }: { onShortcuts: () => void }) => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const t = useT(messages)
  const signOut = useSignOut()
  const tour = useRef(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AccountButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-60'
        // The tour opens once the focus is back on the trigger: its opener.
        onCloseAutoFocus={() => {
          if (tour.current) openTour()
          tour.current = false
        }}
      >
        <DropdownMenuLabel className='grid font-normal'>
          <span className='truncate font-medium'>
            {fullName(user.display_name)}
          </span>
          <span className='truncate text-xs text-muted-foreground'>
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className='h-11 md:h-8'>
          <Link to='/account'>
            <UserRound />
            {t('account')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className='h-11 md:h-8' onSelect={onShortcuts}>
          <Keyboard />
          {t('keyboardShortcuts')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className='h-11 md:h-8'
          onSelect={() => (tour.current = true)}
        >
          <Compass />
          {t('takeTour')}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='h-11 md:h-8'>
          <a href={FEEDBACK_URL} target='_blank' rel='noreferrer'>
            <MessageSquare />
            {t('sendFeedback')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem className='h-11 md:h-8' onSelect={signOut}>
          <LogOut />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
