import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { myProjectsQuery } from '@/entities/home/home-queries'
import { HOME_VIEWS, VIEW_LABEL } from '@/entities/home/views'
import type { HomeView } from '@/shared/api/client'
import { moveTabFocus } from '@/shared/lib/move-tab-focus'
import { cn } from '@/shared/lib/utils'
import { IssueList } from './issue-list'

const AssignedCount = () => {
  const { data: projects } = useQuery(myProjectsQuery)
  if (!projects) return null
  const count = projects.reduce(
    (sum, project) => sum + project.open_assigned,
    0
  )
  return (
    <span className='rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums'>
      {count}
    </span>
  )
}

/** The home lists; the open tab lives in the URL (`?tab=`), Recommended when absent. */
export const HomeTabs = ({ view }: { view: HomeView }) => (
  <div className='grid gap-4'>
    <div
      role='tablist'
      aria-label='Your work'
      onKeyDown={moveTabFocus}
      className='flex flex-wrap gap-x-1 border-b'
    >
      {HOME_VIEWS.map((tab) => (
        <Link
          key={tab}
          id={`home-tab-${tab}`}
          to='/'
          search={{ tab: tab === 'recommended' ? undefined : tab }}
          role='tab'
          aria-selected={tab === view}
          aria-controls='home-panel'
          tabIndex={tab === view ? 0 : -1}
          className={cn(
            '-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            tab === view && 'border-primary font-medium text-foreground'
          )}
        >
          {VIEW_LABEL[tab]}
          {tab === 'assigned' && <AssignedCount />}
        </Link>
      ))}
    </div>
    <div role='tabpanel' id='home-panel' aria-labelledby={`home-tab-${view}`}>
      <IssueList key={view} view={view} />
    </div>
  </div>
)
