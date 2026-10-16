import {
  type ErrorComponentProps,
  Link,
  useRouter,
} from '@tanstack/react-router'
import { Button } from '@/shared/ui/button'

export const ErrorPage = ({ error }: ErrorComponentProps) => {
  const router = useRouter()
  const retry = () => void router.invalidate()

  return (
    <main className='mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center'>
      <h1 className='text-xl font-semibold'>Something went wrong</h1>
      <p className='text-muted-foreground'>{error.message}</p>
      <div className='flex gap-2'>
        <Button className='h-11' onClick={retry}>
          Try again
        </Button>
        <Button asChild variant='ghost' className='h-11'>
          <Link to='/'>Go home</Link>
        </Button>
      </div>
    </main>
  )
}
