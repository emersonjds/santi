import { useEffect, useRef } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import type { Project } from '@/shared/api/client'

const TAB =
  'inline-flex h-11 shrink-0 items-center border-b-2 border-transparent px-2 text-sm md:px-3 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=page]:border-primary aria-[current=page]:text-foreground'

export const ProjectTabs = ({ project }: { project: Project }) => {
  const params = { key: project.key }
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current=page]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])
  return (
    <nav
      ref={nav}
      aria-label='Project views'
      className='-mb-px flex gap-1 overflow-x-auto'
    >
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
      <Link to='/p/$key/people' params={params} className={TAB}>
        People
      </Link>
      <Link to='/p/$key/settings' params={params} className={TAB}>
        Settings
      </Link>
    </nav>
  )
}
