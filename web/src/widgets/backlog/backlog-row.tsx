import { type ReactNode, memo } from 'react'
import { Link } from '@tanstack/react-router'
import { Ellipsis, GripVertical, Layers } from 'lucide-react'
import {
  RowAssignee,
  RowPoints,
  RowSummary,
} from '@/features/edit-row/row-fields'
import { issueNumber } from '@/entities/issue/board-query'
import { SubtaskCount } from '@/entities/issue/issue-card'
import { TypeGlyph } from '@/entities/issue/issue-glyphs'
import { StatusPill } from '@/entities/issue/status-pill'
import type { Status } from '@/entities/issue/statuses'
import { AssigneeAvatar } from '@/entities/user/user-avatar'
import type { Backlog, Card } from '@/shared/api/client'

type Epic = Backlog['epics'][number]

/** The grip's box before the drag layer loads, so nothing moves when it does. */
export const HandleSlot = () => (
  <span
    aria-hidden='true'
    className='relative z-10 hidden h-11 w-6 shrink-0 place-items-center text-subtle-foreground md:grid md:h-9'
  >
    <GripVertical className='size-4' />
  </span>
)

// Same box as the menu button, so nothing moves when the menu chunk arrives.
export const MenuSlot = () => (
  <span
    aria-hidden='true'
    className='grid size-11 place-items-center text-muted-foreground md:size-9'
  >
    <Ellipsis className='size-4' />
  </span>
)

type BacklogRowProps = {
  card: Card
  projectKey: string
  epic?: Epic
  status?: Status
  handle: ReactNode
  menu: ReactNode
  /** BL-19: summary, points and assignee edited in the row (wide screens; a phone opens the issue). */
  editable: boolean
}

const Points = ({ card }: { card: Card }) =>
  card.points != null && (
    <span
      className='rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground tabular-nums'
      aria-label={`${card.points} points`}
    >
      {card.points}
    </span>
  )

const Assignee = ({ card }: { card: Card }) =>
  card.assignee_name && <AssigneeAvatar name={card.assignee_name} />

/** One dense line on wide screens; on a phone the summary takes two lines and the facts wrap below. */
export const BacklogRow = memo(
  ({
    card,
    projectKey,
    epic,
    status,
    handle,
    menu,
    editable,
  }: BacklogRowProps) => {
    const summary = (
      /* IA §6: a dialog over the backlog, the address bar showing the issue page. */
      <Link
        to='.'
        search={(prev) => ({ ...prev, issue: issueNumber(card.key) })}
        mask={{
          to: '/p/$key/issues/$number',
          params: { key: projectKey, number: String(issueNumber(card.key)) },
        }}
        draggable={false}
        data-issue-key={card.key}
        className='line-clamp-2 min-w-0 outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-4 focus-visible:after:outline-ring md:line-clamp-1 md:flex-1'
      >
        {card.summary}
      </Link>
    )
    const fields = { card, projectKey }
    return (
      <div className='group relative flex min-h-11 items-start bg-card ps-1 transition-colors duration-150 hover:bg-hover md:items-center'>
        {handle}
        <div className='grid min-w-0 flex-1 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 py-2 ps-2 text-sm md:flex md:py-1.5 md:ps-0'>
          <TypeGlyph type={card.issue_type} />
          <span className='text-xs tracking-wide whitespace-nowrap text-subtle-foreground tabular-nums'>
            {card.key}
          </span>
          {editable ? <RowSummary {...fields}>{summary}</RowSummary> : summary}
          <span className='col-span-3 flex min-w-0 items-center gap-2 md:contents'>
            {epic && (
              <span
                className='inline-flex min-w-0 items-center gap-1 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground md:max-w-40'
                title={`Epic ${epic.summary}`}
              >
                <Layers
                  className='size-3.5 shrink-0 text-type-epic'
                  aria-hidden='true'
                />
                <span className='truncate'>{epic.summary}</span>
              </span>
            )}
            {status && <StatusPill status={status} />}
            <SubtaskCount card={card} />
            {editable ? <RowPoints {...fields} /> : <Points card={card} />}
            {editable ? <RowAssignee {...fields} /> : <Assignee card={card} />}
          </span>
        </div>
        <div className='relative z-10'>{menu}</div>
      </div>
    )
  }
)
