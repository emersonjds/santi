import {
  type RefObject,
  Suspense,
  lazy,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronRight, Folders, Plus } from 'lucide-react'
import { StarProjectButton } from '@/features/star/star-button'
import { sidebarProjects } from '@/entities/home/sidebar-projects'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import type { MyProject } from '@/shared/api/client'
import type { ProjectsView } from '@/shared/lib/sidebar-prefs'
import { LoadFailed } from '@/shared/ui/load-failed'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/shared/ui/sidebar'
import { ProjectActionsButton } from './project-actions-button'
import {
  CURRENT,
  FlyoutEntry,
  type FlyoutState,
  ProjectSkeletons,
} from './sidebar-entries'

const ProjectActions = lazy(() =>
  import('./project-actions').then((module) => ({
    default: module.ProjectActions,
  }))
)

const MoreProjectsFlyout = lazy(() =>
  import('./more-projects-flyout').then((module) => ({
    default: module.MoreProjectsFlyout,
  }))
)

const PageLink = ({
  to,
  projectKey,
  onNavigate,
  children,
}: {
  to:
    | '/p/$key/board'
    | '/p/$key/backlog'
    | '/p/$key/reports'
    | '/p/$key/settings'
  projectKey: string
  onNavigate: () => void
  children: string
}) => (
  <SidebarMenuSubItem>
    <SidebarMenuSubButton asChild className={`h-9 ${CURRENT}`}>
      <Link to={to} params={{ key: projectKey }} onClick={onNavigate}>
        {children}
      </Link>
    </SidebarMenuSubButton>
  </SidebarMenuSubItem>
)

/** UI-65: the current project opens; a row opened by hand closes again on reload. */
const ProjectItem = ({
  project,
  current,
  lastStarredRef,
  onNavigate,
}: {
  project: MyProject
  current: boolean
  lastStarredRef: RefObject<string | null>
  onNavigate: () => void
}) => {
  const row = useRef<HTMLDivElement>(null)
  // A star moves the row to the other sublist, a new element: the focus left with the old one.
  useEffect(() => {
    if (
      lastStarredRef.current !== project.key ||
      document.activeElement !== document.body
    )
      return
    row.current?.querySelector<HTMLElement>('[aria-pressed]')?.focus()
  }, [lastStarredRef, project.key])
  const onStar = () => (lastStarredRef.current = project.key)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const expanded = toggled ?? current
  const pagesId = `sidebar-pages-${project.key}`
  const page = { projectKey: project.key, onNavigate }

  return (
    <SidebarMenuItem>
      <div ref={row} className='flex items-center pe-11 md:pe-9'>
        <button
          type='button'
          aria-label={`Toggle ${project.name}`}
          aria-expanded={expanded}
          aria-controls={pagesId}
          onClick={() => setToggled(!expanded)}
          className='grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:size-8'
        >
          <ChevronRight
            className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
        <SidebarMenuButton
          asChild
          className='h-11 min-w-0 flex-1 pe-2! md:h-10'
        >
          <Link
            to='/p/$key'
            params={{ key: project.key }}
            activeOptions={{ exact: true }}
            title={project.name}
            onClick={onNavigate}
          >
            <ProjectAvatar name={project.name} />
            <span className='flex-1 truncate'>{project.name}</span>
            <span className='hidden text-xs text-subtle-foreground tabular-nums md:inline'>
              {project.key}
            </span>
          </Link>
        </SidebarMenuButton>
        <StarProjectButton
          project={project}
          className='group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 md:opacity-0'
          onToggle={onStar}
        />
      </div>
      <Suspense
        fallback={<ProjectActionsButton projectName={project.name} disabled />}
      >
        <ProjectActions
          project={project}
          onNavigate={onNavigate}
          onStar={onStar}
        />
      </Suspense>
      <SidebarMenuSub id={pagesId} hidden={!expanded}>
        <PageLink to='/p/$key/board' {...page}>
          Board
        </PageLink>
        {project.board_type === 'scrum' && (
          <>
            <PageLink to='/p/$key/backlog' {...page}>
              Backlog
            </PageLink>
            <PageLink to='/p/$key/reports' {...page}>
              Reports
            </PageLink>
          </>
        )}
        <PageLink to='/p/$key/settings' {...page}>
          Settings
        </PageLink>
      </SidebarMenuSub>
    </SidebarMenuItem>
  )
}

const SUBLABEL = 'px-2 pt-2 pb-1 text-xs text-muted-foreground'

const Sublist = ({
  label,
  projects,
  current,
  lastStarredRef,
  onNavigate,
}: {
  label: string
  projects: MyProject[]
  current?: string
  lastStarredRef: RefObject<string | null>
  onNavigate: () => void
}) => {
  const id = useId()
  if (projects.length === 0) return null
  return (
    <>
      <p id={id} className={SUBLABEL}>
        {label}
      </p>
      <SidebarMenu aria-labelledby={id}>
        {projects.map((project) => (
          <ProjectItem
            key={project.key}
            project={project}
            current={project.key === current}
            lastStarredRef={lastStarredRef}
            onNavigate={onNavigate}
          />
        ))}
      </SidebarMenu>
    </>
  )
}

/** UI-61/64 (lazy chunk): starred, then recent, then the rest behind More projects. */
export const ProjectSections = ({
  list,
  view,
  flyouts,
  onNavigate,
  onLeaveFlyout,
}: {
  list: UseQueryResult<MyProject[]>
  view: ProjectsView
  flyouts: FlyoutState
  onNavigate: () => void
  onLeaveFlyout: () => void
}) => {
  const projects = list.data
  const { key } = useParams({ strict: false })
  const lastStarredRef = useRef<string | null>(null)
  const failed = list.isError && (
    <LoadFailed
      message='Projects did not load.'
      onRetry={() => void list.refetch()}
    />
  )

  if (!projects) return failed || <ProjectSkeletons />
  if (projects.length === 0)
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <p className={SUBLABEL}>No projects yet</p>
          <SidebarMenuButton asChild className='h-11 md:h-10'>
            <Link to='/projects/new' onClick={onNavigate}>
              <Plus />
              <span>Create project</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  const { starred, recent } = sidebarProjects(projects, view, key)
  const sublist = { current: key, lastStarredRef, onNavigate }
  return (
    <>
      {failed}
      <Sublist label='Starred' projects={starred} {...sublist} />
      <Sublist label='Recent' projects={recent} {...sublist} />
      <SidebarMenu>
        <FlyoutEntry name='More projects' icon={Folders} flyouts={flyouts}>
          <MoreProjectsFlyout
            projects={projects}
            shown={[...starred, ...recent]}
            onNavigate={onLeaveFlyout}
          />
        </FlyoutEntry>
      </SidebarMenu>
    </>
  )
}
