import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import { useRecordVisit } from '@/entities/home/record-visit'
import { BoardTypeBadge } from '@/entities/project/board-type-badge'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import { membersQuery, projectQuery } from '@/entities/project/project-queries'
import { Button } from '@/shared/ui/button'
import { MemberStack, STACK } from './member-stack'
import { ProjectTabs } from './project-tabs'

// Lazy: only admins open it, and the board route has no initial JS to spare (D39).
const InviteDialog = lazy(() =>
  import('@/features/project/invite-dialog').then((module) => ({
    default: module.InviteDialog,
  }))
)

const MembersPopover = lazy(() =>
  import('./members-popover').then((module) => ({
    default: module.MembersPopover,
  }))
)

const MembersFallback = ({ projectKey }: { projectKey: string }) => {
  const { data: members } = useSuspenseQuery(membersQuery(projectKey))
  return (
    <span aria-hidden='true' className={STACK}>
      <MemberStack members={members} />
    </span>
  )
}

const InviteFallback = () => (
  <Button variant='outline' className='h-11 md:h-9' disabled>
    <UserPlus />
    Invite
  </Button>
)

export const ProjectHeader = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key' })
  useRecordVisit(key)
  const { data: project } = useSuspenseQuery(projectQuery(key))

  return (
    <header className='flex flex-col gap-3 border-b px-4 pt-4 sm:px-6'>
      <nav aria-label='Breadcrumb' className='text-sm text-muted-foreground'>
        <ol className='flex items-center gap-1.5'>
          <li>
            <Link
              to='/'
              className='inline-flex min-h-11 items-center hover:text-foreground hover:underline md:min-h-0'
            >
              Projects
            </Link>
          </li>
          <li aria-hidden='true'>/</li>
          <li aria-current='page' className='truncate text-foreground'>
            {project.name}
          </li>
        </ol>
      </nav>
      <div className='flex flex-wrap items-center gap-3'>
        <ProjectAvatar name={project.name} className='size-9 text-sm' />
        <h1 className='truncate text-2xl font-semibold tracking-tight'>
          {project.name}
        </h1>
        <BoardTypeBadge type={project.board_type} />
        <div className='flex items-center gap-2 sm:ms-auto'>
          <Suspense fallback={<MembersFallback projectKey={project.key} />}>
            <MembersPopover
              projectKey={project.key}
              admin={project.role === 'admin'}
            />
          </Suspense>
          {project.role === 'admin' && (
            <Suspense fallback={<InviteFallback />}>
              <InviteDialog projectKey={project.key} />
            </Suspense>
          )}
        </div>
      </div>
      <ProjectTabs project={project} />
    </header>
  )
}
