import { Link } from '@tanstack/react-router'
import { Button } from '@/shared/ui/button'

export const NotFoundPage = () => (
  <main className='mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center'>
    <p className='text-5xl font-bold text-primary tabular-nums'>404</p>
    <h1 className='text-xl font-semibold'>Page not found</h1>
    <p className='text-muted-foreground'>
      This page does not exist, or it belongs to a project you are not in.
    </p>
    <Button asChild className='h-11'>
      <Link to='/'>Go home</Link>
    </Button>
  </main>
)
