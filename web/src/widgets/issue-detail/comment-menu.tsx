import { type Ref, useRef } from 'react'
import { Ellipsis, Link2, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

type CommentMenuProps = {
  ref?: Ref<HTMLButtonElement>
  hidden?: boolean
  /** Author or admin, in a writable project; else Copy link only. */
  writable: boolean
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
}

/** SAN-136 Q4: from md up it shows on hover and focus of its comment; always at 375. */
export const CommentMenu = ({
  ref,
  hidden,
  writable,
  onEdit,
  onCopy,
  onDelete,
}: CommentMenuProps) => {
  // Edit opens once the menu has given the focus back, so the editor keeps it.
  const editAfterClose = useRef(false)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={ref}
        hidden={hidden}
        aria-label='Comment actions'
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8',
          'md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100 md:data-[state=open]:opacity-100'
        )}
      >
        <Ellipsis className='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-44'
        onCloseAutoFocus={(event) => {
          if (!editAfterClose.current) return
          editAfterClose.current = false
          event.preventDefault()
          onEdit()
        }}
      >
        {writable && (
          <DropdownMenuItem
            className='max-md:min-h-11'
            onSelect={() => (editAfterClose.current = true)}
          >
            <Pencil />
            Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className='max-md:min-h-11' onSelect={onCopy}>
          <Link2 />
          Copy link
        </DropdownMenuItem>
        {writable && (
          <DropdownMenuItem
            className='max-md:min-h-11'
            variant='destructive'
            onSelect={onDelete}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
