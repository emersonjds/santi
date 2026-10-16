import { Link } from '@tanstack/react-router'
import { FolderKanban, Plus } from 'lucide-react'
import { AppHeader } from '@/widgets/app-header/app-header'
import { Button } from '@/shared/ui/button'

export const HomePage = () => (
  <>
    <AppHeader />
    <main className='mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center'>
      <FolderKanban className='size-10 text-muted-foreground' aria-hidden />
      <h1 className='text-xl font-semibold'>No projects yet</h1>
      <p className='text-muted-foreground'>
        A project groups a board, its backlog and its sprints.
      </p>
      <Button asChild className='h-11'>
        <Link to='/projects/new'>
          <Plus />
          New project
        </Link>
      </Button>
    </main>
  </>
)
