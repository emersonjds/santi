import { useSuspenseQuery } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useSignOut } from '@/features/auth/use-sign-out'
import { sessionQuery } from '@/entities/session/session-query'
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
  const { data: user } = useSuspenseQuery(sessionQuery)
  const signOut = useSignOut()
  const name = user?.display_name ?? ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          aria-label='Account'
          className='size-11 shrink-0 rounded-full p-0 md:size-9'
        >
          <UserAvatar name={name} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-60'>
        <DropdownMenuLabel className='grid font-normal'>
          <span className='truncate font-medium'>{name}</span>
          <span className='truncate text-xs text-muted-foreground'>
            {user?.email}
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
