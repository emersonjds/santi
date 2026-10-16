import {
  avatarTone,
  fullName,
  initials,
  shortName,
} from '@/shared/lib/initials'
import { cn } from '@/shared/lib/utils'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'

export const UserAvatar = ({
  name,
  className,
}: {
  name: string
  className?: string
}) => (
  <Avatar className={cn('size-8', className)} title={fullName(name)}>
    <AvatarFallback
      className={cn('text-[0.6875rem] font-semibold', avatarTone(name))}
    >
      {initials(name)}
    </AvatarFallback>
  </Avatar>
)

/** The 24px assignee dot of cards, rows and results. */
export const AssigneeAvatar = ({ name }: { name: string }) => (
  <span
    className={cn(
      'grid size-6 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold',
      avatarTone(name)
    )}
    title={`Assigned to ${fullName(name)}`}
  >
    {initials(name)}
  </span>
)

/** SAN-100: first and last name on one line, the full name on hover. */
export const PersonName = ({
  name,
  className,
}: {
  name: string
  className?: string
}) => (
  <span className={className} title={fullName(name)}>
    {shortName(name)}
  </span>
)
