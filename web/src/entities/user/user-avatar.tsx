import { cn } from '@/shared/lib/utils'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')

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
