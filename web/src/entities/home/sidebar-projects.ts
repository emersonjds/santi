import type { MyProject } from '@/shared/api/client'
import type { ProjectsView } from '@/shared/lib/sidebar-prefs'

const RECENT_ROWS = 5

const starTime = (project: MyProject) =>
  project.starred_at ? Date.parse(project.starred_at) : 0

/** UI-61/62: `projects` in the /api/me/projects order, the latest visit first; `current` stays in view. */
export const sidebarProjects = (
  projects: MyProject[],
  view: ProjectsView,
  current?: string
) => {
  if (view === 'latest') return { starred: [], recent: projects.slice(0, 1) }
  const starred = projects
    .filter((project) => project.starred)
    .sort((left, right) => starTime(right) - starTime(left))
  if (view === 'starred')
    return {
      starred,
      recent: projects.filter(
        (project) => project.key === current && !project.starred
      ),
    }
  return {
    starred,
    recent: projects
      .filter((project) => !project.starred)
      .slice(0, RECENT_ROWS),
  }
}

const matches = (project: MyProject, q: string) =>
  [project.name, project.key].some((text) =>
    text.toLowerCase().includes(q.toLowerCase())
  )

/** UI-64: what the sidebar leaves out; visited ones in visit order, then the rest by name. */
export const moreProjects = (
  projects: MyProject[],
  shown: MyProject[],
  q: string
) => {
  const rest = projects.filter(
    (project) =>
      !shown.some(({ key }) => key === project.key) && matches(project, q)
  )
  return {
    recent: rest.filter((project) => project.visited_at),
    other: rest
      .filter((project) => !project.visited_at)
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      ),
  }
}
