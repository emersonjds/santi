import { useQuery } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import {
  LifecycleButton,
  PurgeProjectButton,
} from '@/features/project-lifecycle/lifecycle-dialogs'
import { NoProjects, ProjectsFailed } from '@/features/project/no-projects'
import { StarProjectButton } from '@/features/star/star-button'
import { myProjectsQuery } from '@/entities/home/home-queries'
import { timeAgo } from '@/entities/issue/time-ago'
import { BOARD_TYPE_LABEL } from '@/entities/project/labels'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import { projectsInStateQuery } from '@/entities/project/project-queries'
import type { MyProject, Project } from '@/shared/api/client'
import { moveTabFocus } from '@/shared/lib/move-tab-focus'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  PROJECTS_TABS,
  PROJECTS_TAB_LABEL,
  type ProjectsTab,
  STATE_OF,
} from './projects-search'

const HEAD = 'px-3 py-2 text-start text-xs font-semibold text-muted-foreground'
const WIDE = 'hidden sm:table-cell'

const DAY = 86_400_000

const byName = (left: { name: string }, right: { name: string }) =>
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

const whenBy = (at?: string | null, by?: string | null) =>
  at ? `${timeAgo(at)}${by ? ` by ${by}` : ''}` : ''

const daysLeft = (purgeAt?: string | null) => {
  if (!purgeAt) return ''
  const days = Math.max(0, Math.ceil((Date.parse(purgeAt) - Date.now()) / DAY))
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

const NameCell = ({ project }: { project: Project }) => (
  <td className='px-3 py-2'>
    <span className='flex min-w-0 items-center gap-3'>
      <ProjectAvatar name={project.name} className='size-8 text-sm' />
      <span className='grid min-w-0'>
        {project.state === 'archived' ? (
          <Link
            to='/p/$key'
            params={{ key: project.key }}
            className='truncate font-medium hover:underline'
          >
            {project.name}
          </Link>
        ) : (
          <span className='truncate font-medium'>{project.name}</span>
        )}
        <span className='text-xs text-muted-foreground tabular-nums sm:hidden'>
          {project.key}
        </span>
      </span>
    </span>
  </td>
)

const LifecycleRow = ({ project }: { project: Project }) => {
  const trashed = project.state === 'trashed'
  return (
    <tr className='border-t'>
      <NameCell project={project} />
      <td className={`${WIDE} px-3 tabular-nums`}>{project.key}</td>
      <td className={`${WIDE} px-3`}>
        {trashed
          ? whenBy(project.trashed_at, project.trashed_by)
          : whenBy(project.archived_at, project.archived_by)}
      </td>
      {trashed && (
        <td className='px-3 tabular-nums'>{daysLeft(project.purge_at)}</td>
      )}
      <td className='px-3 py-2'>
        <span className='flex flex-wrap justify-end gap-2'>
          <LifecycleButton
            projectKey={project.key}
            action={trashed ? 'restore' : 'unarchive'}
            aria-label={`${trashed ? 'Restore' : 'Unarchive'} ${project.name}`}
          >
            {trashed ? 'Restore' : 'Unarchive'}
          </LifecycleButton>
          {trashed && (
            <PurgeProjectButton
              projectKey={project.key}
              projectName={project.name}
            />
          )}
        </span>
      </td>
    </tr>
  )
}

const EMPTY = {
  archived: 'No archived projects',
  trash: 'Nothing in the trash',
} as const

/** SAN-70: only what the caller administers comes back. */
const LifecycleProjects = ({ tab }: { tab: 'archived' | 'trash' }) => {
  const {
    data: projects,
    isError,
    refetch,
  } = useQuery(projectsInStateQuery(STATE_OF[tab]))
  if (isError) return <ProjectsFailed onRetry={() => void refetch()} />
  if (!projects) return <TableSkeleton />
  if (projects.length === 0)
    return (
      <p className='rounded-lg border bg-card px-4 py-10 text-center text-muted-foreground'>
        {EMPTY[tab]}
      </p>
    )
  const trash = tab === 'trash'
  return (
    <div className='overflow-hidden rounded-lg border bg-card'>
      <table className='w-full table-fixed text-sm'>
        <thead>
          <tr>
            <th className={HEAD}>Name</th>
            <th className={`${HEAD} ${WIDE} w-24`}>Key</th>
            <th className={`${HEAD} ${WIDE} w-48`}>
              {trash ? 'Trashed' : 'Archived'}
            </th>
            {trash && <th className={`${HEAD} w-24`}>Days left</th>}
            <th className={`${HEAD} ${trash ? 'w-36 sm:w-64' : 'w-32'}`}>
              <span className='sr-only'>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...projects].sort(byName).map((project) => (
            <LifecycleRow key={project.key} project={project} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Same pattern as the home tabs: the open tab lives in the URL (`?tab=`). */
const ProjectsTabs = ({ tab }: { tab: ProjectsTab }) => (
  <div className='grid gap-4'>
    <div
      role='tablist'
      aria-label='Projects by state'
      onKeyDown={moveTabFocus}
      className='flex flex-wrap gap-x-1 border-b'
    >
      {PROJECTS_TABS.map((each) => (
        <Link
          key={each}
          id={`projects-tab-${each}`}
          to='/projects'
          search={{ tab: each === 'active' ? undefined : each }}
          role='tab'
          aria-selected={each === tab}
          aria-controls='projects-panel'
          tabIndex={each === tab ? 0 : -1}
          className={cn(
            '-mb-px flex h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            each === tab && 'border-primary font-medium text-foreground'
          )}
        >
          {PROJECTS_TAB_LABEL[each]}
        </Link>
      ))}
    </div>
    <div
      role='tabpanel'
      id='projects-panel'
      aria-labelledby={`projects-tab-${tab}`}
    >
      {tab === 'active' ? <Projects /> : <LifecycleProjects tab={tab} />}
    </div>
  </div>
)

/** Every project the caller belongs to, by name; admins also find the archived and trashed ones. */
export const ProjectsPage = () => {
  const { tab = 'active' } = useSearch({ from: '/_authenticated/projects/' })
  return (
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
      <ProjectsTabs tab={tab} />
    </div>
  )
}
