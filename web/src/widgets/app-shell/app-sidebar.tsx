import { Suspense, lazy, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronRight, House, Plus } from 'lucide-react'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import { projectsQuery } from '@/entities/project/project-queries'
import {
  legalDocumentsQuery,
  useLegalRequired,
} from '@/entities/session/legal-queries'
import type { Project } from '@/shared/api/client'
import { FEEDBACK_URL } from '@/shared/lib/links'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/shared/ui/sidebar'
import { ProjectActionsButton } from './project-actions-button'

const ProjectActions = lazy(() =>
  import('./project-actions').then((module) => ({
    default: module.ProjectActions,
  }))
)

const CURRENT =
  'aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:shadow-[inset_3px_0_0_var(--color-primary)]'

const EXPANDED = 'sidebar-expanded:'

// Storage can throw (private mode, blocked site data): rows then open on the current project only.
const storedExpanded = (key: string) => {
  try {
    const value = localStorage.getItem(EXPANDED + key)
    return value === null ? null : value === '1'
  } catch {
    return null
  }
}

const storeExpanded = (key: string, expanded: boolean) => {
  try {
    localStorage.setItem(EXPANDED + key, expanded ? '1' : '0')
  } catch {
    // the choice lasts until the reload
  }
}

const ProjectItem = ({
  project,
  current,
  onNavigate,
}: {
  project: Project
  current: boolean
  onNavigate: () => void
}) => {
  const [stored, setStored] = useState(() => storedExpanded(project.key))
  const expanded = stored ?? current
  const params = { key: project.key }
  const pagesId = `sidebar-pages-${project.key}`
  const toggle = () => {
    storeExpanded(project.key, !expanded)
    setStored(!expanded)
  }

  return (
    <SidebarMenuItem>
      <div className='flex items-center'>
        <button
          type='button'
          aria-label={`Toggle ${project.name}`}
          aria-expanded={expanded}
          aria-controls={pagesId}
          onClick={toggle}
          className='grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:size-8'
        >
          <ChevronRight
            className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
        <SidebarMenuButton
          asChild
          className='me-11 h-11 min-w-0 flex-1 max-md:pe-2! md:me-0 md:h-10'
        >
          <Link
            to='/p/$key'
            params={params}
            activeOptions={{ exact: true }}
            onClick={onNavigate}
          >
            <ProjectAvatar name={project.name} />
            <span className='flex-1 truncate'>{project.name}</span>
            <span className='hidden text-xs text-subtle-foreground tabular-nums md:inline'>
              {project.key}
            </span>
          </Link>
        </SidebarMenuButton>
      </div>
      <Suspense
        fallback={<ProjectActionsButton projectName={project.name} disabled />}
      >
        <ProjectActions project={project} onNavigate={onNavigate} />
      </Suspense>
      <SidebarMenuSub id={pagesId} hidden={!expanded}>
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild className={`h-9 ${CURRENT}`}>
            <Link to='/p/$key/board' params={params} onClick={onNavigate}>
              Board
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
        {project.board_type === 'scrum' && (
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild className={`h-9 ${CURRENT}`}>
              <Link to='/p/$key/backlog' params={params} onClick={onNavigate}>
                Backlog
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        )}
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild className={`h-9 ${CURRENT}`}>
            <Link to='/p/$key/settings' params={params} onClick={onNavigate}>
              Settings
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </SidebarMenuSub>
    </SidebarMenuItem>
  )
}

const ProjectItems = ({ onNavigate }: { onNavigate: () => void }) => {
  const { key } = useParams({ strict: false })
  const { data: projects } = useQuery(projectsQuery)

  if (!projects)
    return Array.from({ length: 3 }, (_, index) => (
      <SidebarMenuItem key={index}>
        <SidebarMenuSkeleton showIcon className='h-10' />
      </SidebarMenuItem>
    ))
  return projects.map((project) => (
    <ProjectItem
      key={project.key}
      project={project}
      current={project.key === key}
      onNavigate={onNavigate}
    />
  ))
}

const LEGAL = [
  ['Privacy', '/privacy'],
  ['Terms', '/terms'],
] as const

export const AppSidebar = () => {
  const { setOpenMobile } = useSidebar()
  const closeDrawer = () => setOpenMobile(false)
  const { data: legal } = useQuery(legalDocumentsQuery)
  const about = [
    ...(useLegalRequired(legal?.required) ? LEGAL : []),
    ['Feedback', FEEDBACK_URL] as const,
  ]

  return (
    <Sidebar>
      <SidebarContent>
        <nav aria-label='Projects and pages'>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className={`h-10 ${CURRENT}`}>
                  <Link
                    to='/'
                    activeOptions={{ exact: true }}
                    onClick={closeDrawer}
                  >
                    <House />
                    <span>For you</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupAction asChild>
              <Link
                to='/projects/new'
                aria-label='New project'
                title='New project'
                onClick={closeDrawer}
              >
                <Plus />
              </Link>
            </SidebarGroupAction>
            <SidebarMenu>
              <ProjectItems onNavigate={closeDrawer} />
            </SidebarMenu>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <nav
          aria-label='About santi'
          className='flex flex-wrap gap-x-3 px-2 text-xs text-muted-foreground'
        >
          {about.map(([label, href]) => (
            <a
              key={label}
              href={href}
              className='inline-flex min-h-11 items-center hover:text-foreground hover:underline md:min-h-8'
              {...(href === FEEDBACK_URL && {
                target: '_blank',
                rel: 'noreferrer',
              })}
            >
              {label}
            </a>
          ))}
        </nav>
      </SidebarFooter>
    </Sidebar>
  )
}
