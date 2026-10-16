import { useRouteContext } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useSignOut } from '@/features/auth/use-sign-out'
import { UserAvatar } from '@/entities/user/user-avatar'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

export const AccountMenu = () => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const signOut = useSignOut()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          aria-label='Account'
          className='size-11 shrink-0 rounded-full p-0 md:size-9'
        >
          <UserAvatar name={user.display_name} />
        </Button>
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
