import { Link } from '@tanstack/react-router'
import type { Project } from '@/shared/api/client'

const TAB =
  'inline-flex h-11 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground'

export const ProjectTabs = ({ project }: { project: Project }) => {
  const params = { key: project.key }
  return (
    <nav aria-label='Project views' className='-mb-px flex gap-1'>
      <Link to='/p/$key/board' params={params} className={TAB}>
        Board
      </Link>
      {project.board_type === 'scrum' && (
        <>
          <Link to='/p/$key/backlog' params={params} className={TAB}>
            Backlog
          </Link>
          <Link to='/p/$key/reports' params={params} className={TAB}>
            Reports
          </Link>
        </>
      )}
      <Link to='/p/$key/settings' params={params} className={TAB}>
        Settings
      </Link>
    </nav>
  )
}
