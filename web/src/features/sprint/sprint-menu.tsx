import { CircleCheck, Ellipsis, Pencil, Trash2 } from 'lucide-react'
import type { Sprint } from '@/shared/api/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

const ROW = 'max-md:min-h-11'

type SprintMenuProps = {
  sprint: Sprint
  onEdit: () => void
  onDelete?: () => void
  onComplete?: () => void
}

/** The sprint's "…" (lazy chunk): edit; complete when asked for (R-4); delete only while it is planned (D14). */
export const SprintMenu = ({
  sprint,
  onEdit,
  onDelete,
  onComplete,
}: SprintMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label={`More for ${sprint.name}`}
      className='grid size-11 place-items-center rounded-md text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-9'
    >
      <Ellipsis className='size-4' />
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end' className='w-44'>
      <DropdownMenuItem className={ROW} onSelect={onEdit}>
        <Pencil />
        Edit sprint
      </DropdownMenuItem>
      {sprint.state === 'active' && onComplete && (
        <DropdownMenuItem className={ROW} onSelect={onComplete}>
          <CircleCheck />
          Complete sprint
        </DropdownMenuItem>
      )}
      {sprint.state === 'future' && onDelete && (
        <DropdownMenuItem
          className={ROW}
          variant='destructive'
          onSelect={onDelete}
        >
          <Trash2 />
          Delete sprint
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
)
