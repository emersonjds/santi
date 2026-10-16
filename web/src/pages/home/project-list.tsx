import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { BoardTypeBadge } from '@/entities/project/board-type-badge'
import { ROLE_LABEL } from '@/entities/project/labels'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import type { Project } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const ROW = 'h-16 rounded-lg border'

export const ProjectListSkeleton = () => (
  <div role='status' aria-label='Loading projects' className='mt-6 grid gap-3'>
    <Skeleton className='h-11 w-32 md:h-8' />
    <div className='grid gap-2'>
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className={ROW} />
      ))}
    </div>
  </div>
)

export const ProjectList = ({ projects }: { projects: Project[] }) => (
  <section aria-labelledby='your-projects' className='mt-6 grid gap-3'>
    <div className='flex items-center justify-between gap-4'>
      <h2
        id='your-projects'
        className='text-sm font-semibold text-muted-foreground'
      >
        Your projects
      </h2>
      <Button asChild variant='outline' className='h-11 md:h-8'>
        <Link to='/projects/new'>
          <Plus />
          New project
        </Link>
      </Button>
    </div>
    <ul className='grid gap-2'>
      {projects.map((project) => (
        <li key={project.key}>
          <Link
            to='/p/$key'
            params={{ key: project.key }}
            className={`${ROW} flex items-center gap-3 bg-card px-4 transition-[background-color,border-color] duration-150 ease-out outline-none hover:border-input/60 hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring`}
          >
            <ProjectAvatar name={project.name} className='size-9 text-sm' />
            <span className='grid min-w-0 flex-1'>
              <span className='truncate font-medium'>{project.name}</span>
              <span className='text-xs text-muted-foreground tabular-nums'>
                {project.key}
              </span>
            </span>
            <BoardTypeBadge type={project.board_type} />
            <span className='w-14 text-end text-xs text-muted-foreground'>
              {ROLE_LABEL[project.role]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
)
