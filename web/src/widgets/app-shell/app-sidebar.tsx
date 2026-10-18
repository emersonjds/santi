import { Suspense, lazy, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Clock, House, Plus, Star } from 'lucide-react'
import { myProjectsQuery } from '@/entities/home/home-queries'
import {
  legalDocumentsQuery,
  useLegalRequired,
} from '@/entities/session/legal-queries'
import { FEEDBACK_URL } from '@/shared/lib/links'
import {
  type ProjectsView,
  storeProjectsView,
  storedProjectsView,
} from '@/shared/lib/sidebar-prefs'
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
  useSidebar,
} from '@/shared/ui/sidebar'
import { HEADER_ACTION, ProjectsMenuButton } from './project-actions-button'
import {
  CURRENT,
  type Flyout,
  FlyoutEntry,
  ProjectSkeletons,
} from './sidebar-entries'

const ProjectSections = lazy(() =>
  import('./project-sections').then((module) => ({
    default: module.ProjectSections,
  }))
)

const ProjectsHeaderMenu = lazy(() =>
  import('./projects-header-menu').then((module) => ({
    default: module.ProjectsHeaderMenu,
  }))
)

const RecentFlyout = lazy(() =>
  import('./recent-flyout').then((module) => ({
    default: module.RecentFlyout,
  }))
)

const StarredFlyout = lazy(() =>
  import('./starred-flyout').then((module) => ({
    default: module.StarredFlyout,
  }))
)

const LEGAL = [
  ['Privacy', '/privacy'],
  ['Terms', '/terms'],
] as const

export const AppSidebar = () => {
  const { setOpenMobile } = useSidebar()
  const [open, setOpen] = useState<Flyout | null>(null)
  const flyouts = { open, setOpen }
  const [view, setView] = useState(storedProjectsView)
  const closeDrawer = () => setOpenMobile(false)
  const leaveFlyout = () => {
    setOpen(null)
    closeDrawer()
  }
  const changeView = (next: ProjectsView) => {
    storeProjectsView(next)
    setView(next)
  }
  const projects = useQuery(myProjectsQuery)
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
              <FlyoutEntry name='Recent' icon={Clock} flyouts={flyouts}>
                <RecentFlyout onNavigate={leaveFlyout} />
              </FlyoutEntry>
              <FlyoutEntry name='Starred' icon={Star} flyouts={flyouts}>
                <StarredFlyout onNavigate={leaveFlyout} />
              </FlyoutEntry>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel className='max-md:h-11'>
              Projects
            </SidebarGroupLabel>
            <SidebarGroupAction
              asChild
              className={`${HEADER_ACTION} inset-e-14 md:inset-e-10`}
            >
              <Link
                to='/projects/new'
                aria-label='New project'
                title='New project'
                onClick={closeDrawer}
              >
                <Plus />
              </Link>
            </SidebarGroupAction>
            <Suspense fallback={<ProjectsMenuButton disabled />}>
              <ProjectsHeaderMenu
                view={view}
                onViewChange={changeView}
                onNavigate={closeDrawer}
              />
            </Suspense>
            <Suspense fallback={<ProjectSkeletons />}>
              <ProjectSections
                list={projects}
                view={view}
                flyouts={flyouts}
                onNavigate={closeDrawer}
                onLeaveFlyout={leaveFlyout}
              />
            </Suspense>
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
