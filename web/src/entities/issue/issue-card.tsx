import { type ReactNode, memo } from 'react'
import { Link } from '@tanstack/react-router'
import { Ban, ListTree } from 'lucide-react'
import { AssigneeAvatar } from '@/entities/user/user-avatar'
import type { Card } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'
import { issueNumber } from './board-query'
import { PriorityGlyph, TypeGlyph } from './issue-glyphs'
import { LabelChip } from './label-chip'
import { timeAgo } from './time-ago'

/** The list a column draws its cards in; the drag layer reuses it so nothing shifts when it loads. */
export const CARD_LIST =
  'grid min-h-16 grid-cols-1 content-start gap-2 px-2 pb-2'

export const EmptySlot = () => (
  <li className='rounded-md border border-dashed border-input px-3 py-4 text-center text-sm text-subtle-foreground'>
    Drop issues here
  </li>
)

/** D57: a parent's `done/total` subtasks, on its board card and backlog row. */
export const SubtaskCount = ({ card }: { card: Card }) => {
  const done = card.total_subtasks - card.open_subtasks
  return (
    card.total_subtasks > 0 && (
      <span
        className='inline-flex items-center gap-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums'
        title={`${done} of ${card.total_subtasks} subtasks done`}
      >
        <ListTree className='size-3.5' aria-hidden='true' />
        {done}/{card.total_subtasks}
      </span>
    )
  )
}

/** SAN-157 Q4: blocked by issues that are not done yet. */
export const BlockedMarker = ({ card }: { card: Card }) =>
  card.blocked_by?.length ? (
    <span
      className='inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 text-xs font-medium text-destructive'
      title={`Blocked by ${card.blocked_by.join(', ')}`}
    >
      <Ban className='size-3.5' aria-hidden='true' />
      Blocked
    </span>
  ) : null

/** SAN-101: two labels on one line, then how many more; the rest on hover. `oneOnPhone` (SAN-122): one whole label below md. */
export const LabelChips = ({
  labels,
  oneOnPhone = false,
}: {
  labels: string[]
  oneOnPhone?: boolean
}) => {
  if (labels.length === 0) return null
  const rest = labels.slice(2)
  const phoneRest = labels.slice(1)
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1',
        oneOnPhone && 'max-md:shrink-0'
      )}
    >
      {labels.slice(0, 2).map((label, index) => (
        <LabelChip
          key={label}
          size='compact'
          name={label}
          className={cn(
            'min-w-9',
            oneOnPhone && (index === 0 ? 'max-md:shrink-0' : 'max-md:hidden')
          )}
        />
      ))}
      {oneOnPhone && phoneRest.length > 0 && (
        <MoreLabels labels={phoneRest} className='md:hidden' />
      )}
      {rest.length > 0 && (
        <MoreLabels
          labels={rest}
          className={cn(oneOnPhone && 'max-md:hidden')}
        />
      )}
    </span>
  )
}

const MoreLabels = ({
  labels,
  className,
}: {
  labels: string[]
  className?: string
}) => (
  <span
    title={labels.join(', ')}
    className={cn(
      'shrink-0 text-xs text-muted-foreground tabular-nums',
      className
    )}
  >
    +{labels.length}
  </span>
)

const pointsLabel = (points?: number | null) =>
  points == null ? 'No points' : `${points} points`

/** D47: story points in purple; a dash when the issue has none. */
export const PointsPill = ({
  points,
  label,
}: {
  points?: number | null
  label?: string
}) => (
  <span
    aria-label={label}
    className='inline-grid min-w-7 place-items-center rounded-full bg-points-bg px-2 text-xs font-semibold text-points tabular-nums'
    title='Story points'
  >
    {points ?? '–'}
  </span>
)

type IssueCardProps = {
  card: Card
  projectKey: string
  menu?: ReactNode
  /** Editors from a feature in place of the static pill and glyph. */
  points?: ReactNode
  priority?: ReactNode
}

export const IssueCard = memo(
  ({ card, projectKey, menu, points, priority }: IssueCardProps) => (
    <article className='relative grid gap-2 rounded-md border bg-card p-3 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 ease-out hover:border-input/60 hover:shadow-sm'>
      {card.parent_key && (
        <span className='me-8 w-fit rounded-sm bg-muted px-1.5 text-xs text-muted-foreground tabular-nums'>
          {card.parent_key}
        </span>
      )}
      {/* IA §6: a dialog over the current view, the address bar showing the issue page. */}
      <Link
        to='.'
        search={(prev) => ({ ...prev, issue: issueNumber(card.key) })}
        mask={{
          to: '/p/$key/issues/$number',
          params: { key: projectKey, number: String(issueNumber(card.key)) },
        }}
        draggable={false}
        data-issue-key={card.key}
        className='line-clamp-2 pe-8 outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring'
      >
        {card.summary}
      </Link>
      <div className='flex min-h-6 min-w-0 items-center gap-2 text-xs'>
        <TypeGlyph type={card.issue_type} />
        <span
          className='shrink-0 tracking-wide whitespace-nowrap text-subtle-foreground tabular-nums'
          title={`Updated ${timeAgo(card.updated_at)}`}
        >
          {card.key}
        </span>
        <BlockedMarker card={card} />
        <SubtaskCount card={card} />
        <LabelChips labels={card.labels} />
        <span className='ms-auto flex shrink-0 items-center gap-2'>
          {points ?? (
            <PointsPill points={card.points} label={pointsLabel(card.points)} />
          )}
          {priority ?? <PriorityGlyph priority={card.priority} />}
          {card.assignee_name && <AssigneeAvatar name={card.assignee_name} />}
        </span>
      </div>
      {menu && <div className='absolute end-0.5 top-0.5 z-10'>{menu}</div>}
    </article>
  )
)
