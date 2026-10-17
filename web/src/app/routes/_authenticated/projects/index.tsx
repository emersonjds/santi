import { createFileRoute } from '@tanstack/react-router'
import { ProjectsPage } from '@/pages/projects/projects-page'
import { STATE_OF, parseProjectsSearch } from '@/pages/projects/projects-search'
import { myProjectsQuery } from '@/entities/home/home-queries'
import { projectsInStateQuery } from '@/entities/project/project-queries'

export const Route = createFileRoute('/_authenticated/projects/')({
  validateSearch: parseProjectsSearch,
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ context: { queryClient }, deps }) => {
    if (deps.tab)
      return void queryClient.prefetchQuery(
        projectsInStateQuery(STATE_OF[deps.tab])
      )
    void queryClient.prefetchQuery(myProjectsQuery)
  },
  component: ProjectsPage,
})
