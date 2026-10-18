import { useState } from 'react'
import { moreProjects } from '@/entities/home/sidebar-projects'
import type { MyItem, MyProject } from '@/shared/api/client'
import { useDebouncedValue } from '@/shared/lib/use-debounced-value'
import {
  FlyoutNote,
  FlyoutRow,
  SEARCH_DELAY,
  SidebarFlyout,
} from './sidebar-flyout'

const asItem = (project: MyProject): MyItem => ({
  kind: 'project',
  key: project.key,
  name: project.name,
  project_key: project.key,
  project_name: project.name,
  board_type: project.board_type,
  at: project.visited_at ?? '',
})

const Group = ({
  label,
  projects,
  onNavigate,
}: {
  label: string
  projects: MyProject[]
  onNavigate: () => void
}) =>
  projects.length > 0 && (
    <section aria-label={label} className='grid gap-1'>
      <h3 className='px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
        {label}
      </h3>
      <ul className='grid'>
        {projects.map((project) => (
          <FlyoutRow
            key={project.key}
            item={asItem(project)}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </section>
  )

/** UI-64: searches the sidebar's /api/me/projects list, no request of its own. */
export const MoreProjectsFlyout = ({
  projects,
  shown,
  onNavigate,
}: {
  projects: MyProject[]
  shown: MyProject[]
  onNavigate: () => void
}) => {
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim(), SEARCH_DELAY)
  const all = moreProjects(projects, shown, '')
  const found = moreProjects(projects, shown, q)
  const nothingLeft = all.recent.length + all.other.length === 0

  const body = () => {
    if (nothingLeft)
      return (
        <FlyoutNote
          heading='All your projects are in the sidebar'
          hint='Projects you join later show up here.'
        />
      )
    if (found.recent.length + found.other.length === 0)
      return (
        <FlyoutNote
          heading='No matches'
          hint='Try another word, or see all projects.'
        />
      )
    return (
      <div className='grid gap-3'>
        <Group label='Recent' projects={found.recent} onNavigate={onNavigate} />
        <Group label='Other' projects={found.other} onNavigate={onNavigate} />
      </div>
    )
  }

  return (
    <SidebarFlyout
      title='More projects'
      search={
        nothingLeft
          ? undefined
          : { label: 'Search projects', value: text, onChange: setText }
      }
      viewAll='projects'
      onNavigate={onNavigate}
    >
      {body()}
    </SidebarFlyout>
  )
}
