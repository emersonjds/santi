import { Suspense, lazy } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { projectQuery } from '@/entities/project/project-queries'

const InlineCreate = lazy(() =>
  import('@/features/create-issue/inline-create').then((module) => ({
    default: module.InlineCreate,
  }))
)

const CREATE_ROW =
  'mx-2 mb-2 flex h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground md:h-9'

type CreateSlotProps = {
  projectKey: string
  sprintId?: number | null
  /** The board column the issue lands in, by its first status; none in the backlog. */
  columnId?: number
  open: boolean
  setOpen: (open: boolean) => void
}

/** D5: inline create at the foot of a board column or a backlog section; the form loads on the first click. */
export const CreateSlot = ({
  projectKey,
  sprintId,
  columnId,
  open,
  setOpen,
}: CreateSlotProps) => {
  const { data: project } = useQuery(projectQuery(projectKey))
  const archived = project?.state === 'archived'
  if (!open)
    return (
      <button
        type='button'
        aria-disabled={archived || undefined}
        className={`${CREATE_ROW} outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
        onClick={() => archived || setOpen(true)}
      >
        <Plus className='size-4' />
        Create issue
      </button>
    )
  return (
    <Suspense fallback={<div className={CREATE_ROW} />}>
      <InlineCreate
        sprintId={sprintId}
        columnId={columnId}
        projectKey={projectKey}
        onClose={() => setOpen(false)}
      />
    </Suspense>
  )
}
