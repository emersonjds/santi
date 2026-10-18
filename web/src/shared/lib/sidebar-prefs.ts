const VIEW = 'sidebar-projects-view'

export const PROJECTS_VIEWS = ['recent-starred', 'starred', 'latest'] as const

export type ProjectsView = (typeof PROJECTS_VIEWS)[number]

export const isProjectsView = (value: unknown): value is ProjectsView =>
  PROJECTS_VIEWS.some((view) => view === value)

// Storage can throw (private mode, blocked site data): the choice then lasts until the reload (D49).
export const storedProjectsView = (): ProjectsView => {
  try {
    const value = localStorage.getItem(VIEW)
    return isProjectsView(value) ? value : 'recent-starred'
  } catch {
    return 'recent-starred'
  }
}

export const storeProjectsView = (view: ProjectsView) => {
  try {
    localStorage.setItem(VIEW, view)
  } catch {
    // the choice lasts until the reload
  }
}
