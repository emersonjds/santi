import { type ReactNode, Suspense, lazy } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { legalStatusQuery } from '@/entities/session/legal-queries'
import { Button } from '@/shared/ui/button'

// Lazy: few accounts ever see it, and every page would pay for it (D39).
const AcceptLegal = lazy(() =>
  import('./accept-legal').then((module) => ({ default: module.AcceptLegal }))
)

const Checking = () => (
  <div
    role='status'
    aria-label='Checking the terms'
    className='flex flex-1 items-center justify-center py-16'
  >
    <Loader2 className='size-6 animate-spin text-muted-foreground' />
  </div>
)

/** D45: an account that has not accepted the current versions sees this before the app; the app stays closed until the answer arrives. */
export const LegalGate = ({ children }: { children: ReactNode }) => {
  const { data, isError, refetch } = useQuery(legalStatusQuery)
  if (isError)
    return (
      <div
        role='alert'
        className='mx-auto mt-8 flex w-full max-w-xl items-center justify-between gap-4 rounded-lg border px-4 py-3'
      >
        The terms check did not load.
        <Button
          variant='outline'
          className='h-11 md:h-9'
          onClick={() => refetch()}
        >
          Try again
        </Button>
      </div>
    )
  if (data?.accepted === false)
    return (
      <Suspense fallback={<Checking />}>
        <AcceptLegal />
      </Suspense>
    )
  // Mounted but hidden while pending, the page's queries join the route's prefetches; the
  // wrapper stays put so nothing remounts when the answer arrives.
  return (
    <>
      {!data && <Checking />}
      <div className={data ? 'contents' : 'hidden'}>{children}</div>
    </>
  )
}
