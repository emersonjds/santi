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

const WIDTH = 'sidebar-width'

export const SIDEBAR_WIDTH = { min: 200, max: 500, initial: 320 } as const

export const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width))

export const storedSidebarWidth = (): number => {
  try {
    const width = Number(localStorage.getItem(WIDTH))
    return width >= SIDEBAR_WIDTH.min && width <= SIDEBAR_WIDTH.max
      ? width
      : SIDEBAR_WIDTH.initial
  } catch {
    return SIDEBAR_WIDTH.initial
  }
}

export const storeSidebarWidth = (width: number) => {
  try {
    localStorage.setItem(WIDTH, String(width))
  } catch {
    // the width lasts until the reload
  }
}
