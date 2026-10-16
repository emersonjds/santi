import { Link } from '@tanstack/react-router'
import { IMPORT_SOURCE_LABEL } from '@/entities/project/labels'
import type { ImportResult } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { ProblemRows } from './problem-rows'

type ImportResultViewProps = {
  projectKey: string
  kanban: boolean
  result: ImportResult
  onAgain: () => void
}

/** Step 3: what was created, skipped and failed, and where to look at it. */
export const ImportResultView = ({
  projectKey,
  kanban,
  result,
  onAgain,
}: ImportResultViewProps) => {
  const params = { key: projectKey }
  const counts = [
    ['Created', result.created],
    ['Skipped', result.skipped],
    ['Failed', result.failed],
  ] as const

  return (
    <div className='grid gap-6'>
      <h3 className='font-semibold'>Import finished</h3>
      <ul aria-label='Import counts' className='grid grid-cols-3 gap-2'>
        {counts.map(([label, count]) => (
          <li
            key={label}
            className='grid rounded-md border bg-card px-3 py-2 text-center'
          >
            <span className='text-sm text-muted-foreground'>{label}</span>
            <span className='text-2xl font-semibold tabular-nums'>{count}</span>
          </li>
        ))}
      </ul>
      {result.skipped > 0 && (
        <p className='text-sm text-muted-foreground'>
          {result.skipped === 1 ? '1 row was' : `${result.skipped} rows were`}{' '}
          imported from this {IMPORT_SOURCE_LABEL[result.source]} export before,
          so they were left as they are.
        </p>
      )}
      <ProblemRows problems={result.problems} />
      <div className='flex flex-wrap gap-2'>
        <Button asChild className='h-11 md:h-9'>
          <Link to='/p/$key/board' params={params}>
            Open board
          </Link>
        </Button>
        {!kanban && (
          <Button asChild variant='outline' className='h-11 md:h-9'>
            <Link to='/p/$key/backlog' params={params}>
              Open backlog
            </Link>
          </Button>
        )}
        <Button
          type='button'
          variant='ghost'
          className='h-11 md:h-9'
          onClick={onAgain}
        >
          Import another file
        </Button>
      </div>
    </div>
  )
}
