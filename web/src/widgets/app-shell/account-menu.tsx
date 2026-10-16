import { useRouteContext } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useSignOut } from '@/features/auth/use-sign-out'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { AccountButton } from './account-button'

export const AccountMenu = () => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const signOut = useSignOut()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AccountButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-60'>
        <DropdownMenuLabel className='grid font-normal'>
          <span className='truncate font-medium'>{user.display_name}</span>
          <span className='truncate text-xs text-muted-foreground'>
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className='h-11 md:h-8' onSelect={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
