import { use } from 'react'
import { Ellipsis } from 'lucide-react'
import { planRowMove } from '@/entities/issue/backlog-cache'
import { BacklogContext } from '@/entities/issue/board-context'
import { useMoveRow, useSetEpic } from '@/entities/issue/issue-mutations'
import type { Card } from '@/shared/api/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

// 44px touch targets on phones (ui-layout, Responsive).
const ROW = 'max-md:min-h-11'
const PLACES = ['top', 'bottom'] as const

type RowMenuProps = { card: Card; projectKey: string }

/** The row's "…" (lazy chunk): BL-7 top or bottom of any section and BL-20 its epic, the phone's way to plan (IA §10). */
export const RowMenu = ({ card, projectKey }: RowMenuProps) => {
  const backlog = use(BacklogContext)
  const move = useMoveRow(projectKey)
  const setEpic = useSetEpic(projectKey)
  if (!backlog) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${card.key}`}
        className='grid size-11 place-items-center rounded-md text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-9'
      >
        <Ellipsis className='size-4' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={ROW}>
            Move to…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className='max-h-96 w-44 overflow-y-auto'>
            {backlog.sections.map((section) => {
              const name = section.sprint?.name ?? 'Backlog'
              const sprintId = section.sprint?.id ?? null
              return (
                <DropdownMenuGroup key={sprintId ?? 'backlog'}>
                  <DropdownMenuLabel className='truncate text-xs text-muted-foreground'>
                    {name}
                  </DropdownMenuLabel>
                  {PLACES.map((place) => (
                    <DropdownMenuItem
                      className={ROW}
                      key={place}
                      aria-label={`Move to the ${place} of ${name}`}
                      onSelect={() =>
                        move.mutate(
                          planRowMove(
                            backlog,
                            card,
                            sprintId,
                            place === 'top' ? 0 : section.cards.length
                          )
                        )
                      }
                    >
                      {place === 'top' ? 'Top' : 'Bottom'}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={ROW}>
            Set epic
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className='max-h-96 w-56 overflow-y-auto'>
            <DropdownMenuItem
              className={ROW}
              onSelect={() => setEpic.mutate({ card, epic: null })}
            >
              No epic
            </DropdownMenuItem>
            {backlog.epics.map((epic) => (
              <DropdownMenuItem
                key={epic.key}
                className={ROW}
                onSelect={() => setEpic.mutate({ card, epic: epic.key })}
              >
                <span className='truncate'>
                  {epic.key} {epic.summary}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
