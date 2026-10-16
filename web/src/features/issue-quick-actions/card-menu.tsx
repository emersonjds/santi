import { use } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Copy, Ellipsis } from 'lucide-react'
import { toast } from 'sonner'
import { planMove } from '@/entities/issue/board-cache'
import { BoardContext } from '@/entities/issue/board-context'
import { useMoveIssue, useUpdateIssue } from '@/entities/issue/issue-mutations'
import { PRIORITY_LABEL } from '@/entities/issue/labels'
import { membersQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import type { Card, Priority } from '@/shared/api/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

type CardMenuProps = { card: Card; projectKey: string }

const PLACES = ['top', 'bottom'] as const
const UNASSIGNED = 'none'

const isPriority = (value: string): value is Priority => value in PRIORITY_LABEL

const MoveTo = ({ card, projectKey }: CardMenuProps) => {
  const board = use(BoardContext)
  const move = useMoveIssue(projectKey)
  if (!board) return null

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className='w-48'>
        {board.columns.map((column) => (
          <DropdownMenuGroup key={column.id}>
            <DropdownMenuLabel>{column.name}</DropdownMenuLabel>
            {PLACES.map((place) => (
              <DropdownMenuItem
                key={place}
                aria-label={`Move to the ${place} of ${column.name}`}
                onSelect={() =>
                  move.mutate(
                    planMove(
                      board,
                      card,
                      column.id,
                      place === 'top' ? 0 : column.cards.length
                    )
                  )
                }
              >
                {place === 'top' ? 'Top' : 'Bottom'}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

const Edits = ({ card, projectKey }: CardMenuProps) => {
  const { data: members } = useSuspenseQuery(membersQuery(projectKey))
  const { data: me } = useSuspenseQuery(sessionQuery)
  const update = useUpdateIssue(projectKey)

  const assign = (userId: number | null) =>
    update.mutate({
      card,
      change: { assignee_id: userId },
      shown: {
        assignee_id: userId,
        assignee_name:
          members.find((member) => member.user_id === userId)?.display_name ??
          null,
      },
    })

  return (
    <>
      {me && card.assignee_id !== me.id && (
        <DropdownMenuItem onSelect={() => assign(me.id)}>
          Assign to me
        </DropdownMenuItem>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Assign…</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className='max-h-80 w-56 overflow-y-auto'>
          <DropdownMenuRadioGroup
            value={String(card.assignee_id ?? UNASSIGNED)}
            onValueChange={(value) =>
              assign(value === UNASSIGNED ? null : Number(value))
            }
          >
            <DropdownMenuRadioItem value={UNASSIGNED}>
              Unassigned
            </DropdownMenuRadioItem>
            {members.map((member) => (
              <DropdownMenuRadioItem
                key={member.user_id}
                value={String(member.user_id)}
              >
                {member.display_name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Set priority</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={card.priority}
            onValueChange={(priority) =>
              isPriority(priority) &&
              update.mutate({ card, change: { priority }, shown: { priority } })
            }
          >
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )
}

const copyKey = (key: string) =>
  navigator.clipboard.writeText(key).then(
    () => toast.success(`Copied ${key}`),
    () => toast.error(`Couldn't copy ${key}`)
  )

/** The card's "…" menu (lazy chunk): every edit is optimistic and says so when it fails. */
export const CardMenu = ({ card, projectKey }: CardMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label={`Actions for ${card.key}`}
      className='grid size-10 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
    >
      <Ellipsis className='size-4' />
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end' className='w-52'>
      <MoveTo card={card} projectKey={projectKey} />
      <Edits card={card} projectKey={projectKey} />
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void copyKey(card.key)}>
        <Copy />
        Copy issue key
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)
