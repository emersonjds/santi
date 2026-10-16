import { Suspense, lazy } from 'react'
import { Plus } from 'lucide-react'

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
  open: boolean
  setOpen: (open: boolean) => void
}

/** D5: inline create at the foot of the first column or a backlog section; the form loads on the first click. */
export const CreateSlot = ({
  projectKey,
  sprintId,
  open,
  setOpen,
}: CreateSlotProps) => {
  if (!open)
    return (
      <button
        type='button'
        className={`${CREATE_ROW} outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring`}
        onClick={() => setOpen(true)}
      >
        <Plus className='size-4' />
        Create issue
      </button>
    )
  return (
    <Suspense fallback={<div className={CREATE_ROW} />}>
      <InlineCreate
        sprintId={sprintId}
        projectKey={projectKey}
        onClose={() => setOpen(false)}
      />
    </Suspense>
  )
}
