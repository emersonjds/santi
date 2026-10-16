import { Ellipsis, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

/** UI-31: the issue's "…"; delete is the one action v1 keeps there. */
export const IssueMenu = ({ onDelete }: { onDelete: () => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label='More actions'
      className='grid size-11 place-items-center rounded-md outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8'
    >
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
