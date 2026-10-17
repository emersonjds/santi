import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { ForbiddenPage } from '@/pages/forbidden/forbidden-page'
import {
  RemoveMemberButton,
  RoleSelect,
} from '@/features/project/member-controls'
import { membersQuery, projectQuery } from '@/entities/project/project-queries'
import { WriteLock } from '@/entities/project/write-lock'
import { UserAvatar } from '@/entities/user/user-avatar'
import { fullName } from '@/shared/lib/initials'

const InviteDialog = lazy(() =>
  import('@/features/project/invite-dialog').then((module) => ({
    default: module.InviteDialog,
  }))
)

const LAST_ADMIN = 'A project needs at least one admin.'

/** IA §3, §9: roles, removal and invites, for admins only. */
export const MembersPage = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key' })
  const { data: project } = useSuspenseQuery(projectQuery(key))
  const { data: members } = useSuspenseQuery(membersQuery(key))
  if (project.role !== 'admin') return <ForbiddenPage projectKey={key} />
  const admins = members.filter((member) => member.role === 'admin').length

  return (
    <WriteLock projectKey={key}>
      <div className='mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 sm:px-6'>
        <div className='flex items-center justify-between gap-3'>
          <h2 id='members' className='text-lg font-semibold'>
            Members
          </h2>
          <Suspense fallback={<span className='block h-11 md:h-9' />}>
            <InviteDialog projectKey={key} />
          </Suspense>
        </div>
        <ul
          aria-labelledby='members'
          className='grid gap-px overflow-hidden rounded-md border bg-border'
        >
          {members.map((member) => {
            const locked = member.role === 'admin' && admins === 1
            return (
              <li
                key={member.user_id}
                className='flex flex-wrap items-center gap-3 bg-card px-3 py-2'
              >
                <UserAvatar name={member.display_name} />
                <span className='grid min-w-48 flex-1'>
                  <span className='truncate font-medium'>
                    {fullName(member.display_name)}
                  </span>
                  <span className='truncate text-sm text-muted-foreground'>
                    {member.email}
                  </span>
                </span>
                <span className='ms-auto flex flex-wrap items-center justify-end gap-2'>
                  <RoleSelect
                    projectKey={key}
                    member={member}
                    locked={locked}
                  />
                  <RemoveMemberButton
                    projectKey={key}
                    member={member}
                    locked={locked}
                  />
                </span>
                {locked && (
                  <p className='basis-full text-end text-xs text-subtle-foreground'>
                    {LAST_ADMIN}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </WriteLock>
  )
}
