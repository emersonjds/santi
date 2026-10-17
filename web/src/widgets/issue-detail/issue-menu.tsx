import { Ellipsis, Trash2 } from 'lucide-react'
import { lockedButton } from '@/shared/lib/read-only'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

const TRIGGER =
  'grid size-11 place-items-center rounded-md outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8'

/** UI-31: the issue's "…"; delete is the one action v1 keeps there, so a lock locks the trigger. */
export const IssueMenu = ({
  note,
  onDelete,
}: {
  note?: string
  onDelete: () => void
}) =>
  note ? (
    <button
      type='button'
      aria-label='More actions'
      className={`${TRIGGER} cursor-not-allowed opacity-50 hover:bg-transparent`}
      {...lockedButton(note)}
    >
      <Ellipsis className='size-4' />
    </button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label='More actions' className={TRIGGER}>
        <Ellipsis className='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        <DropdownMenuItem
          className='max-md:min-h-11'
          variant='destructive'
          onSelect={onDelete}
        >
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
