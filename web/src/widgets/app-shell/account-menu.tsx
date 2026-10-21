import { Link } from '@tanstack/react-router'
import { Keyboard, LogOut, MessageSquare, UserRound } from 'lucide-react'
import { useSignOut } from '@/features/auth/use-sign-out'
import { useSignedInUser } from '@/entities/session/use-signed-in-user'
import { fullName } from '@/shared/lib/initials'
import { FEEDBACK_URL } from '@/shared/lib/links'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { AccountButton } from './account-button'

export const AccountMenu = ({ onShortcuts }: { onShortcuts: () => void }) => {
  const user = useSignedInUser()
  const signOut = useSignOut()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AccountButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-60'>
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
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className='h-11 md:h-8' onSelect={onShortcuts}>
          <Keyboard />
          Keyboard shortcuts
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='h-11 md:h-8'>
          <a href={FEEDBACK_URL} target='_blank' rel='noreferrer'>
            <MessageSquare />
            Send feedback
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem className='h-11 md:h-8' onSelect={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
