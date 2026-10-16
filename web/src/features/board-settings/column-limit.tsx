import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ellipsis } from 'lucide-react'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { useSettingsEdit } from './settings-edits'

type ColumnLimitProps = { projectKey: string; columnId: number }

/** KB-16: the column header "…" (admins, kanban) sets the D7 limit in place; the same write as the settings page. */
export const ColumnLimit = ({ projectKey, columnId }: ColumnLimitProps) => {
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  const edit = useSettingsEdit(projectKey)
  const [editing, setEditing] = useState(false)
  const column = settings?.columns.find((each) => each.id === columnId)
  if (!column) return null
  const current = column.wip_limit ?? null

  const save = (text: string) => {
    setEditing(false)
    const limit = Number(text) >= 1 ? Math.floor(Number(text)) : null
    if (limit !== current)
      edit.mutate({
        kind: 'update-column',
        column,
        name: column.name,
        wip_limit: limit,
      })
  }

  if (editing)
    return (
      <Input
        type='number'
        min={1}
        inputMode='numeric'
        placeholder='No limit'
        aria-label={`WIP limit of ${column.name}`}
        autoFocus
        defaultValue={current ?? ''}
        className='ms-auto h-11 w-24 bg-background tracking-normal normal-case md:h-8'
        onBlur={(event) => save(event.target.value)}
        onKeyDown={(event) => {
          // Both end in blur, which saves once; Escape puts the value back first.
          if (event.key === 'Escape')
            event.currentTarget.value = String(current ?? '')
          if (event.key === 'Enter' || event.key === 'Escape')
            event.currentTarget.blur()
        }}
      />
    )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for column ${column.name}`}
        className='-my-2 grid size-11 place-items-center rounded-md outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8'
      >
        <Ellipsis className='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem
          className='max-md:min-h-11'
          onSelect={() => setEditing(true)}
        >
          Set WIP limit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
