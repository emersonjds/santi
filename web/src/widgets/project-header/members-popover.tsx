import { useSuspenseQuery } from '@tanstack/react-query'
import { ROLE_LABEL } from '@/entities/project/labels'
import { membersQuery } from '@/entities/project/project-queries'
import { UserAvatar } from '@/entities/user/user-avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

const SHOWN = 5

export const MembersPopover = ({ projectKey }: { projectKey: string }) => {
  const { data: members } = useSuspenseQuery(membersQuery(projectKey))
  const more = members.length - SHOWN

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Members: ${members.length}`}
        className='flex h-11 items-center -space-x-2 rounded-full px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
      >
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
      </PopoverTrigger>
      <PopoverContent align='end' className='w-72 p-0'>
        <p className='border-b px-3 py-2 text-sm font-medium'>Members</p>
        <ul className='max-h-80 overflow-y-auto py-1'>
          {members.map((member) => (
            <li
              key={member.user_id}
              className='flex items-center gap-3 px-3 py-2'
            >
              <UserAvatar name={member.display_name} />
              <span className='grid min-w-0 flex-1'>
                <span className='truncate text-sm font-medium'>
                  {member.display_name}
                </span>
                <span className='truncate text-xs text-muted-foreground'>
                  {member.email}
                </span>
              </span>
              <span className='text-xs text-muted-foreground'>
                {ROLE_LABEL[member.role]}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
