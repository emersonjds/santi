import { Link } from '@tanstack/react-router'
import { Eye, FolderCog } from 'lucide-react'
import {
  PROJECTS_VIEWS,
  type ProjectsView,
  isProjectsView,
} from '@/shared/lib/sidebar-prefs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ProjectsMenuButton } from './project-actions-button'

const ROW = 'h-11 md:h-8'

const VIEW_LABEL = {
  'recent-starred': 'Recent and starred',
  starred: 'Starred only',
  latest: 'Most recent project',
} satisfies Record<ProjectsView, string>

/** UI-62 (lazy chunk). */
export const ProjectsHeaderMenu = ({
  view,
  onViewChange,
  onNavigate,
}: {
  view: ProjectsView
  onViewChange: (view: ProjectsView) => void
  onNavigate: () => void
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <ProjectsMenuButton />
    </DropdownMenuTrigger>
    <DropdownMenuContent align='start' className='w-60'>
      <DropdownMenuItem asChild className={ROW}>
        <Link to='/projects' onClick={onNavigate}>
          <FolderCog />
          Manage projects
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={ROW}>
          <Eye />
          View
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={view}
            onValueChange={(value) =>
              isProjectsView(value) && onViewChange(value)
            }
          >
            {PROJECTS_VIEWS.map((option) => (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                className={ROW}
              >
                {VIEW_LABEL[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
)
