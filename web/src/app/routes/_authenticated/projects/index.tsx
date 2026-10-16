import { createFileRoute } from '@tanstack/react-router'
import { ProjectsPage } from '@/pages/projects/projects-page'
import { myProjectsQuery } from '@/entities/home/home-queries'

export const Route = createFileRoute('/_authenticated/projects/')({
  loader: ({ context: { queryClient } }) =>
    void queryClient.prefetchQuery(myProjectsQuery),
  component: ProjectsPage,
})
