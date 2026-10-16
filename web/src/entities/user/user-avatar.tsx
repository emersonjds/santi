import { initials } from '@/shared/lib/initials'
import { cn } from '@/shared/lib/utils'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'

export const UserAvatar = ({
  name,
  className,
}: {
  name: string
  className?: string
}) => (
  <Avatar className={cn('size-8', className)}>
    <AvatarFallback className='bg-accent text-xs font-semibold text-accent-foreground'>
      {initials(name)}
    </AvatarFallback>
  </Avatar>
)
