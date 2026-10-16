import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { NoProjects, ProjectsFailed } from '@/features/project/no-projects'
import { StarProjectButton } from '@/features/star/star-button'
import { myProjectsQuery } from '@/entities/home/home-queries'
import { BOARD_TYPE_LABEL } from '@/entities/project/labels'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import type { MyProject } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const HEAD = 'px-3 py-2 text-start text-xs font-semibold text-muted-foreground'
const WIDE = 'hidden sm:table-cell'

const byName = (left: MyProject, right: MyProject) =>
  left.name.localeCompare(right.name)

const ProjectRow = ({ project }: { project: MyProject }) => (
  <tr className='group border-t hover:bg-hover'>
    <td className='w-12 ps-1'>
      <StarProjectButton project={project} />
    </td>
    <td className='relative px-3 py-2'>
      <span className='flex min-w-0 items-center gap-3'>
        <ProjectAvatar name={project.name} className='size-8 text-sm' />
        <span className='grid min-w-0'>
          <Link
            to='/p/$key'
            params={{ key: project.key }}
            className='truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring'
          >
            {project.name}
          </Link>
          <span className='text-xs text-muted-foreground tabular-nums sm:hidden'>
            {project.key}
          </span>
        </span>
      </span>
    </td>
    <td className={`${WIDE} px-3 tabular-nums`}>{project.key}</td>
    <td className={`${WIDE} px-3`}>
      Software · {BOARD_TYPE_LABEL[project.board_type]}
    </td>
    <td className={`${WIDE} truncate px-3`}>{project.lead_name}</td>
  </tr>
)

const TableSkeleton = () => (
  <div role='status' aria-label='Loading projects' className='grid gap-px'>
    {[0, 1, 2].map((row) => (
      <Skeleton key={row} className='h-13' />
    ))}
  </div>
)

const Projects = () => {
  const { data: projects, isError, refetch } = useQuery(myProjectsQuery)
  if (isError) return <ProjectsFailed onRetry={() => void refetch()} />
  if (!projects) return <TableSkeleton />
  if (projects.length === 0) return <NoProjects />
  return (
    <div className='overflow-hidden rounded-lg border bg-card'>
      <table className='w-full table-fixed text-sm'>
        <thead>
          <tr>
            <th className={`${HEAD} w-12`}>
              <span className='sr-only'>Starred</span>
            </th>
            <th className={HEAD}>Name</th>
            <th className={`${HEAD} ${WIDE} w-28`}>Key</th>
            <th className={`${HEAD} ${WIDE} w-40`}>Type</th>
            <th className={`${HEAD} ${WIDE} w-44`}>Lead</th>
          </tr>
        </thead>
        <tbody>
          {[...projects].sort(byName).map((project) => (
            <ProjectRow key={project.key} project={project} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Every project the caller belongs to, by name. */
export const ProjectsPage = () => (
  <div className='mx-auto grid w-full max-w-[68.75rem] gap-6 px-4 py-6 md:px-6 md:py-8'>
    <div className='flex items-center justify-between gap-4'>
      <h1 className='text-2xl font-semibold tracking-tight'>Projects</h1>
      <Button asChild className='h-11 md:h-9'>
        <Link to='/projects/new'>
          <Plus />
          New project
        </Link>
      </Button>
    </div>
    <Projects />
  </div>
)
