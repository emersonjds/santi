import { Link } from '@tanstack/react-router'
import { Button } from '@/shared/ui/button'

/** IA §9: a member opening an admin page by URL. */
export const ForbiddenPage = ({ projectKey }: { projectKey: string }) => (
  <div className='mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center'>
    <p className='text-5xl font-bold text-primary tabular-nums'>403</p>
    <h2 className='text-xl font-semibold'>Admins only</h2>
    <p className='text-muted-foreground'>
      Only project admins can change settings.
    </p>
    <Button asChild className='h-11'>
      <Link to='/p/$key/board' params={{ key: projectKey }}>
        Back to the board
      </Link>
    </Button>
  </div>
)
