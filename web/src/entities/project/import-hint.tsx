import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { projectQuery } from './project-queries'

/** D41: an empty project points its admins to the importer. */
export const ImportHint = ({ projectKey }: { projectKey: string }) => {
  const { data: project } = useQuery(projectQuery(projectKey))
  if (project?.role !== 'admin') return null
  return (
    <p className='text-sm text-muted-foreground'>
      No issues yet.{' '}
      <Link
        to='/p/$key/settings/import'
        params={{ key: projectKey }}
        className='inline-flex min-h-11 items-center font-medium text-primary hover:underline'
      >
        Bring your work from Jira or Linear
      </Link>
    </p>
  )
}
