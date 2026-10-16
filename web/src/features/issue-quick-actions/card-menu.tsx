import { use } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  Copy,
  Ellipsis,
  SignalHigh,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { planMove, statusMove } from '@/entities/issue/board-cache'
import { BoardContext } from '@/entities/issue/board-context'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { useMoveIssue, useUpdateIssue } from '@/entities/issue/issue-mutations'
import { PRIORITY_LABEL, isPriority } from '@/entities/issue/labels'
import { mayDelete } from '@/entities/issue/may-delete'
import { statusesOf } from '@/entities/issue/statuses'
import { membersQuery, projectQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import type { Card } from '@/shared/api/client'
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

// 44px touch targets on phones (ui-layout, Responsive).
const ROW = 'max-md:min-h-11'

const PLACES = ['top', 'bottom'] as const
const UNASSIGNED = 'none'

const MoveTo = ({ card, projectKey }: CardMenuProps) => {
  const board = use(BoardContext)
  const move = useMoveIssue(projectKey)
  const { data: settings } = useQuery(boardSettingsQuery(projectKey))
  if (!board) return null

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={ROW}>
        <ArrowRightLeft />
        Move to…
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className='w-40'>
        {board.columns.map((column) => {
          const statuses = statusesOf(settings, column.id)
          // SB-17: a column holding several statuses offers each; top and bottom stay for single-status columns and the card's own.
          const several = statuses.length > 1
          return (
            <DropdownMenuGroup key={column.id}>
              <DropdownMenuLabel className='text-xs text-muted-foreground'>
                {column.name}
              </DropdownMenuLabel>
              {(!several || column.id === card.column_id) &&
                PLACES.map((place) => (
                  <DropdownMenuItem
                    className={ROW}
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
              {several &&
                statuses
                  .filter((status) => status.id !== card.status_id)
                  .map((status) => (
                    <DropdownMenuItem
                      className={ROW}
                      key={status.id}
                      aria-label={`Move to ${status.name}`}
                      onSelect={() =>
                        move.mutate(
                          statusMove(board, card, column.id, status.id)
                        )
                      }
                    >
                      {status.name}
                    </DropdownMenuItem>
                  ))}
            </DropdownMenuGroup>
          )
        })}
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
        <DropdownMenuItem className={ROW} onSelect={() => assign(me.id)}>
          <UserCheck />
          Assign to me
        </DropdownMenuItem>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={ROW}>
          <UserPlus />
          Assign…
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className='max-h-80 w-40 overflow-y-auto'>
          <DropdownMenuRadioGroup
            value={String(card.assignee_id ?? UNASSIGNED)}
            onValueChange={(value) =>
              assign(value === UNASSIGNED ? null : Number(value))
            }
          >
            <DropdownMenuRadioItem className={ROW} value={UNASSIGNED}>
              Unassigned
            </DropdownMenuRadioItem>
            {members.map((member) => (
              <DropdownMenuRadioItem
                className={ROW}
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
        <DropdownMenuSubTrigger className={ROW}>
          <SignalHigh />
          Set priority
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={card.priority}
            onValueChange={(priority) =>
              isPriority(priority) &&
              update.mutate({ card, change: { priority }, shown: { priority } })
            }
          >
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <DropdownMenuRadioItem className={ROW} key={value} value={value}>
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
export const CardMenu = ({
  card,
  projectKey,
  onDelete,
}: CardMenuProps & { onDelete: (card: Card) => void }) => {
  const { data: me } = useSuspenseQuery(sessionQuery)
  const { data: project } = useSuspenseQuery(projectQuery(projectKey))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${card.key}`}
        className='grid size-11 place-items-center rounded-md text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-10'
      >
        <Ellipsis className='size-4' />
      </DropdownMenuTrigger>
      {/* Menu and submenu fit side by side in 375px: the submenu opens to the left on a phone. */}
      <DropdownMenuContent align='end' className='w-44'>
        <MoveTo card={card} projectKey={projectKey} />
        <Edits card={card} projectKey={projectKey} />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={ROW}
          onSelect={() => void copyKey(card.key)}
        >
          <Copy />
          Copy issue key
        </DropdownMenuItem>
        {mayDelete(project, me, card.reporter_id) && (
          <DropdownMenuItem
            className={ROW}
            variant='destructive'
            onSelect={() => onDelete(card)}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
