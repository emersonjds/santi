import { Outlet, createFileRoute } from '@tanstack/react-router'
import { ProjectHeader } from '@/widgets/project-header/project-header'
import { loadProject } from '@/entities/project/project-queries'

export const Route = createFileRoute('/_authenticated/p/$key')({
  loader: ({ context, params }) => loadProject(context.queryClient, params.key),
  component: () => (
    <>
      <ProjectHeader />
      <Outlet />
    </>
  ),
})
