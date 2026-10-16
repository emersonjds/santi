export const PROJECTS_TAB_LABEL = {
  active: 'Active',
  archived: 'Archived',
  trash: 'Trash',
} as const

export type ProjectsTab = keyof typeof PROJECTS_TAB_LABEL

const isProjectsTab = (value: unknown): value is ProjectsTab =>
  typeof value === 'string' && Object.hasOwn(PROJECTS_TAB_LABEL, value)

export const PROJECTS_TABS =
  Object.keys(PROJECTS_TAB_LABEL).filter(isProjectsTab)

/** The API's name for each tab's state. */
export const STATE_OF = { archived: 'archived', trash: 'trashed' } as const

/** The /projects URL: the open tab, Active when absent. */
export const parseProjectsSearch = (
  search: Record<string, unknown>
): { tab?: Exclude<ProjectsTab, 'active'> } => ({
  tab:
    isProjectsTab(search.tab) && search.tab !== 'active'
      ? search.tab
      : undefined,
})
