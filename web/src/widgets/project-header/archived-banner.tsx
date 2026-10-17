import { Archive } from 'lucide-react'
import { LifecycleButton } from '@/features/project-lifecycle/lifecycle-button'
import type { Project } from '@/shared/api/client'

/** SAN-70: an archived project opens by link, read-only; admins can bring it back. */
export const ArchivedBanner = ({ project }: { project: Project }) => (
  <div
    role='status'
    className='flex flex-wrap items-center gap-3 rounded-md border bg-muted px-3 py-2 text-sm'
  >
    <Archive aria-hidden='true' className='size-4 shrink-0' />
    <span className='flex-1'>This project is archived and read-only.</span>
    {project.role === 'admin' && (
      <LifecycleButton projectKey={project.key} action='unarchive'>
        Unarchive
      </LifecycleButton>
    )}
  </div>
)
