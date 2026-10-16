import { Link } from '@tanstack/react-router'
import { FolderKanban, Plus } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { SampleProjectButton } from './sample-project-button'

export const NoProjects = () => (
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

export const ProjectsFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div
    role='alert'
    className='mt-6 flex items-center justify-between gap-4 rounded-lg border px-4 py-3'
  >
    Your projects did not load.
    <Button variant='outline' className='h-11 md:h-9' onClick={onRetry}>
      Try again
    </Button>
  </div>
)
