import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { ProjectHeader } from '@/widgets/project-header/project-header'
import { loadProject } from '@/entities/project/project-queries'

export const Route = createFileRoute('/_authenticated/p/$key')({
  loader: async ({ context, params, location }) => {
    const project = await loadProject(context.queryClient, params.key)
    // SAN-225 A1: a previous key answers with the current one.
    if (project.key !== params.key)
      throw redirect({
        href: location.href.replace(/^\/p\/[^/?#]+/, `/p/${project.key}`),
        replace: true,
      })
    return project
  },
  component: () => (
    <>
      <ProjectHeader />
      <Outlet />
    </>
  ),
})
