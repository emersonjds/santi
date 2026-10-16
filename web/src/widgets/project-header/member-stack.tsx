import { UserAvatar } from '@/entities/user/user-avatar'
import type { Member } from '@/shared/api/client'

const SHOWN = 5

export const STACK =
  'flex h-11 min-w-11 items-center -space-x-2 rounded-full px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

/** Five avatars and "+n": the members button, drawn before its popover code loads. */
export const MemberStack = ({ members }: { members: Member[] }) => {
  const more = members.length - SHOWN
  return (
    <>
      {members.slice(0, SHOWN).map((member) => (
        <UserAvatar
          key={member.user_id}
          name={member.display_name}
          className='ring-2 ring-background'
        />
      ))}
      {more > 0 && (
        <span className='relative inline-flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums ring-2 ring-background'>
          +{more}
        </span>
      )}
    </>
  )
}
