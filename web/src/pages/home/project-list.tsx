import { Link } from '@tanstack/react-router'
import { BoardTypeBadge } from '@/entities/project/board-type-badge'
import { ROLE_LABEL } from '@/entities/project/labels'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import type { Project } from '@/shared/api/client'
import { Skeleton } from '@/shared/ui/skeleton'

const ROW = 'h-16 rounded-lg border'

export const ProjectListSkeleton = () => (
  <div role='status' aria-label='Loading projects' className='mt-6 grid gap-2'>
    {Array.from({ length: 3 }, (_, index) => (
      <Skeleton key={index} className={ROW} />
    ))}
  </div>
)

export const ProjectList = ({ projects }: { projects: Project[] }) => (
  <section aria-labelledby='your-projects' className='mt-6'>
    <h2 id='your-projects' className='sr-only'>
      Your projects
    </h2>
    <ul className='grid gap-2'>
      {projects.map((project) => (
        <li key={project.key}>
          <Link
            to='/p/$key'
            params={{ key: project.key }}
            className={`${ROW} flex items-center gap-3 bg-card px-4 hover:bg-accent`}
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
