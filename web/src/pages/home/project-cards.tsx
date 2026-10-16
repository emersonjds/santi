import { Link } from '@tanstack/react-router'
import { StarProjectButton } from '@/features/star/star-button'
import { BoardTypeBadge } from '@/entities/project/board-type-badge'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import type { MyProject } from '@/shared/api/client'
import { Skeleton } from '@/shared/ui/skeleton'

const CARDS = 4
const CARD = 'h-36 rounded-lg border'
const GRID = 'grid grid-cols-2 gap-3 lg:grid-cols-4'

const assignedLine = (count: number) =>
  count === 0
    ? 'Nothing open assigned to you'
    : `${count} open ${count === 1 ? 'issue' : 'issues'} assigned to you`

export const ProjectCardsSkeleton = () => (
  <div role='status' aria-label='Loading projects' className={GRID}>
    {Array.from({ length: CARDS }, (_, index) => (
      <Skeleton key={index} className={CARD} />
    ))}
  </div>
)

const ProjectCard = ({ project }: { project: MyProject }) => (
  <li
    className={`${CARD} group relative flex flex-col bg-card p-3 transition-[background-color,border-color] duration-150 ease-out focus-within:ring-2 focus-within:ring-ring hover:border-input/60 hover:bg-hover sm:p-4`}
  >
    <div className='flex items-start gap-3'>
      <ProjectAvatar
        name={project.name}
        className='size-8 text-sm sm:size-10 sm:text-base'
      />
      <div className='grid min-w-0 flex-1'>
        <Link
          to='/p/$key'
          params={{ key: project.key }}
          className='truncate font-medium outline-none after:absolute after:inset-0'
        >
          {project.name}
        </Link>
        <span className='text-xs text-muted-foreground'>Software project</span>
      </div>
    </div>
    <p className='mt-auto line-clamp-2 text-xs text-muted-foreground'>
      {assignedLine(project.open_assigned)}
    </p>
    <div className='mt-2 flex items-center justify-between'>
      <BoardTypeBadge type={project.board_type} />
      <StarProjectButton project={project} className='-my-2 -me-2' />
    </div>
  </li>
)

/** The first projects of the caller's list: recently visited or worked first (server order). */
export const ProjectCards = ({ projects }: { projects: MyProject[] }) => (
  <ul className={GRID}>
    {projects.slice(0, CARDS).map((project) => (
      <ProjectCard key={project.key} project={project} />
    ))}
  </ul>
)
