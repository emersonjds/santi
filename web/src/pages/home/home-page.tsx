import { useQuery } from '@tanstack/react-query'
import { Link, useRouteContext } from '@tanstack/react-router'
import { FolderKanban, Plus } from 'lucide-react'
import { SampleProjectButton } from '@/features/project/sample-project-button'
import { projectsQuery } from '@/entities/project/project-queries'
import { Button } from '@/shared/ui/button'
import { ProjectList, ProjectListSkeleton } from './project-list'

const NoProjects = () => (
  <div className='mt-6 flex flex-col items-center gap-4 rounded-lg border border-dashed px-4 py-12 text-center'>
    <FolderKanban className='size-10 text-muted-foreground' aria-hidden />
    <h2 className='text-xl font-semibold'>No projects yet</h2>
    <p className='text-muted-foreground'>
      A project groups a board, its backlog and its sprints.
    </p>
    <div className='flex flex-wrap justify-center gap-2'>
      <Button asChild className='h-11'>
        <Link to='/projects/new'>
          <Plus />
          New project
        </Link>
      </Button>
      <SampleProjectButton />
    </div>
  </div>
)

const Projects = () => {
  const { data: projects, isError, refetch } = useQuery(projectsQuery)

  if (isError)
    return (
      <div
        role='alert'
        className='mt-6 flex items-center justify-between gap-4 rounded-lg border px-4 py-3'
      >
        Your projects did not load.
        <Button
          variant='outline'
          className='h-11 md:h-9'
          onClick={() => refetch()}
        >
          Try again
        </Button>
      </div>
    )
  if (!projects) return <ProjectListSkeleton />
  if (projects.length === 0) return <NoProjects />
  return <ProjectList projects={projects} />
}

export const HomePage = () => {
  const { user } = useRouteContext({ from: '/_authenticated' })

  return (
    <div className='mx-auto w-full max-w-3xl px-4 py-8'>
      <h1 className='text-2xl font-semibold tracking-tight'>
        Hi, {user.display_name}
      </h1>
      <Projects />
    </div>
  )
}
