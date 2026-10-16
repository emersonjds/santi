import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ROLE_LABEL } from '@/entities/project/labels'
import { membersQuery } from '@/entities/project/project-queries'
import { PersonName, UserAvatar } from '@/entities/user/user-avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { MemberStack, STACK } from './member-stack'

type MembersPopoverProps = { projectKey: string; admin: boolean }

/** Everyone sees the list (IA §9); admins also get the way to the members page. */
export const MembersPopover = ({ projectKey, admin }: MembersPopoverProps) => {
  const { data: members } = useSuspenseQuery(membersQuery(projectKey))

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Members: ${members.length}`}
        className={STACK}
      >
        <MemberStack members={members} />
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
                <PersonName
                  name={member.display_name}
                  className='truncate text-sm font-medium'
                />
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
        {admin && (
          <Link
            to='/p/$key/settings/members'
            params={{ key: projectKey }}
            className='flex min-h-11 items-center border-t px-3 text-sm font-medium text-primary hover:bg-hover'
          >
            Manage members
          </Link>
        )}
      </PopoverContent>
    </Popover>
  )
}
