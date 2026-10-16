import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { House, Plus } from 'lucide-react'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import { projectsQuery } from '@/entities/project/project-queries'
import type { Project } from '@/shared/api/client'
import {
  Sidebar,
  SidebarContent,
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

const CURRENT =
  'aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:shadow-[inset_3px_0_0_var(--color-primary)]'

const ProjectItem = ({
  project,
  expanded,
  onNavigate,
}: {
  project: Project
  expanded: boolean
  onNavigate: () => void
}) => {
  const params = { key: project.key }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className='h-10'>
        <Link
          to='/p/$key'
          params={params}
          activeOptions={{ exact: true }}
          onClick={onNavigate}
        >
          <ProjectAvatar name={project.name} />
          <span className='flex-1 truncate'>{project.name}</span>
          <span className='text-xs text-subtle-foreground tabular-nums'>
            {project.key}
          </span>
        </Link>
      </SidebarMenuButton>
      {expanded && (
        <SidebarMenuSub>
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
        </SidebarMenuSub>
      )}
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
      expanded={project.key === key}
      onNavigate={onNavigate}
    />
  ))
}

export const AppSidebar = () => {
  const { setOpenMobile } = useSidebar()
  const closeDrawer = () => setOpenMobile(false)

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
                    <span>Home</span>
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
    </Sidebar>
  )
}
