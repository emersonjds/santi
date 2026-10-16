import type { HomeView } from '@/shared/api/client'

export const VIEW_LABEL = {
  recommended: 'Recommended',
  assigned: 'Assigned to me',
  starred: 'Starred',
  worked: 'Worked on',
  viewed: 'Viewed',
} satisfies Record<HomeView, string>

export const isHomeView = (value: unknown): value is HomeView =>
  typeof value === 'string' && Object.hasOwn(VIEW_LABEL, value)

export const HOME_VIEWS = Object.keys(VIEW_LABEL).filter(isHomeView)

/** The home URL: the open tab, Recommended when absent. */
export const parseHomeSearch = (
  search: Record<string, unknown>
): { tab?: HomeView } => ({
  tab: isHomeView(search.tab) ? search.tab : undefined,
})
