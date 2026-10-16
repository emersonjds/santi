import { Link, useRouteContext } from '@tanstack/react-router'
import { StarProjectButton } from '@/features/star/star-button'
import { BoardTypeBadge } from '@/entities/project/board-type-badge'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import type { MyProject } from '@/shared/api/client'
import { Skeleton } from '@/shared/ui/skeleton'

const CARDS = 4
const CARD = 'h-36 rounded-lg border'
const GRID = 'grid grid-cols-2 gap-3 lg:grid-cols-4'

const AssignedCount = ({ project }: { project: MyProject }) => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const count = project.open_assigned
  if (count === 0)
    return (
      <p className='mt-auto text-xs text-muted-foreground'>
        No open issues assigned to you
      </p>
    )
  return (
    <Link
      to='/p/$key/board'
      params={{ key: project.key }}
      search={{ assignee: [user.id] }}
      className='relative z-10 mt-auto inline-flex min-h-11 items-center self-start rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring md:min-h-8'
    >
      {count} open {count === 1 ? 'issue' : 'issues'} assigned to you
    </Link>
  )
}

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
      <StarProjectButton project={project} className='-my-2 -me-2' />
    </div>
    <AssignedCount project={project} />
    <div className='mt-1'>
      <BoardTypeBadge type={project.board_type} />
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
