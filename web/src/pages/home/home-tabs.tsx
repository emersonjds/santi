import type { KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { myProjectsQuery } from '@/entities/home/home-queries'
import { HOME_VIEWS, VIEW_LABEL } from '@/entities/home/views'
import type { HomeView } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'
import { IssueList } from './issue-list'

/** WAI-ARIA tabs: arrow keys, Home and End move between tabs; Space opens the focused one. */
const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key === ' ' && event.target instanceof HTMLElement) {
    event.preventDefault()
    event.target.click()
    return
  }
  const tabs = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role=tab]'),
  ]
  const current = tabs.findIndex((tab) => tab === document.activeElement)
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : step === undefined
          ? -1
          : (current + step + tabs.length) % tabs.length
  if (next < 0) return
  event.preventDefault()
  tabs[next].focus()
}

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
      onKeyDown={moveFocus}
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
