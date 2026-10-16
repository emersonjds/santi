import { Link } from '@tanstack/react-router'
import { AppHeader } from '@/widgets/app-header/app-header'

export const NewProjectPage = () => (
  <>
    <AppHeader />
    <main className='mx-auto flex max-w-md flex-col gap-4 px-4 py-16'>
      <h1 className='text-xl font-semibold'>New project</h1>
      <p className='text-muted-foreground'>
        Creating a project from this screen is coming soon.
      </p>
      <Link to='/' className='text-primary underline'>
        Back to home
      </Link>
    </main>
  </>
)
