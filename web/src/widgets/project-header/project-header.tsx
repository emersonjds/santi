import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { UserPlus } from 'lucide-react'
import { BoardTypeBadge } from '@/entities/project/board-type-badge'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import { projectQuery } from '@/entities/project/project-queries'
import { Button } from '@/shared/ui/button'
import { MembersPopover } from './members-popover'
import { ProjectTabs } from './project-tabs'

// Lazy: only admins open it, and the board route has no initial JS to spare (D39).
const InviteDialog = lazy(() =>
  import('@/features/project/invite-dialog').then((module) => ({
    default: module.InviteDialog,
  }))
)

const InviteFallback = () => (
  <Button variant='outline' className='h-11 md:h-9' disabled>
    <UserPlus />
    Invite
  </Button>
)

export const ProjectHeader = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key' })
  const { data: project } = useSuspenseQuery(projectQuery(key))

  return (
    <header className='flex flex-col gap-3 border-b px-4 pt-4 sm:px-6'>
      <nav aria-label='Breadcrumb' className='text-sm text-muted-foreground'>
        <ol className='flex items-center gap-1.5'>
          <li>
            <Link to='/' className='hover:text-foreground hover:underline'>
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
        <div className='ms-auto flex items-center gap-2'>
          <MembersPopover projectKey={project.key} />
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
