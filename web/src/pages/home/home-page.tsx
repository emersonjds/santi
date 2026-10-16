import { useQuery } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { NoProjects, ProjectsFailed } from '@/features/project/no-projects'
import { myProjectsQuery } from '@/entities/home/home-queries'
import { HomeTabs } from './home-tabs'
import { ProjectCards, ProjectCardsSkeleton } from './project-cards'

/** UI-9: recommended projects, then the caller's lists in tabs. */
export const HomePage = () => {
  const { tab = 'recommended' } = useSearch({ from: '/_authenticated/' })
  const { data: projects, isError, refetch } = useQuery(myProjectsQuery)
  const none = projects?.length === 0

  return (
    <div className='mx-auto grid w-full max-w-[68.75rem] gap-8 px-4 py-6 md:px-6 md:py-8'>
      <h1 className='text-2xl font-semibold tracking-tight'>For you</h1>
      {none ? (
        <NoProjects />
      ) : (
        <>
          <section
            aria-labelledby='recommended-projects'
            className='grid gap-3'
          >
            <div className='flex items-center justify-between gap-4'>
              <h2
                id='recommended-projects'
                className='text-sm font-semibold text-muted-foreground'
              >
                Recommended projects
              </h2>
              <Link
                to='/projects'
                className='-my-3 inline-flex h-11 items-center rounded-md px-2 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring'
              >
                View all projects
              </Link>
            </div>
            {isError ? (
              <ProjectsFailed onRetry={() => void refetch()} />
            ) : projects ? (
              <ProjectCards projects={projects} />
            ) : (
              <ProjectCardsSkeleton />
            )}
          </section>
          <HomeTabs view={tab} />
        </>
      )}
    </div>
  )
}
