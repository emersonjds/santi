import { useEffect } from 'react'
import {
  type ErrorComponentProps,
  Link,
  useRouter,
} from '@tanstack/react-router'
import { browser, isChunkError, reloadOnce } from '@/shared/lib/stale-chunks'
import { Button } from '@/shared/ui/button'
import { SantiMark } from '@/shared/ui/santi-mark'

export const ErrorPage = ({ error }: ErrorComponentProps) => {
  const router = useRouter()
  const retry = () =>
    isChunkError(error) ? browser.reload() : void router.invalidate()
  useEffect(() => {
    if (isChunkError(error)) reloadOnce()
  }, [error])

  return (
    <main className='mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center'>
      <SantiMark className='size-12' />
      <h1 className='text-xl font-semibold'>Something went wrong</h1>
      <p className='text-muted-foreground'>
        {error instanceof Error ? error.message : String(error)}
      </p>
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
