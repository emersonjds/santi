import { type ReactNode, memo } from 'react'
import { Link } from '@tanstack/react-router'
import { ListTree } from 'lucide-react'
import { AssigneeAvatar } from '@/entities/user/user-avatar'
import type { Card } from '@/shared/api/client'
import { issueNumber } from './board-query'
import { PriorityGlyph, TypeGlyph } from './issue-glyphs'
import { timeAgo } from './time-ago'

/** The list a column draws its cards in; the drag layer reuses it so nothing shifts when it loads. */
export const CARD_LIST = 'grid min-h-16 grid-cols-1 content-start gap-2 px-2 pb-2'

export const EmptySlot = () => (
  <li className='rounded-md border border-dashed border-input px-3 py-4 text-center text-sm text-subtle-foreground'>
    Drop issues here
  </li>
)

/** D6: a parent's `open/total` subtasks, on its board card and backlog row. */
export const SubtaskCount = ({ card }: { card: Card }) =>
  card.total_subtasks > 0 && (
    <span
      className='inline-flex items-center gap-1 rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums'
      title={`${card.open_subtasks} of ${card.total_subtasks} subtasks open`}
    >
      <ListTree className='size-3.5' aria-hidden='true' />
      {card.open_subtasks}/{card.total_subtasks}
    </span>
  )

/** SAN-101: two labels on one line, then how many more; the rest on hover. */
export const LabelChips = ({ labels }: { labels: string[] }) => {
  if (labels.length === 0) return null
  const rest = labels.slice(2)
  return (
    <span className='flex min-w-0 items-center gap-1'>
      {labels.slice(0, 2).map((label) => (
        <span
          key={label}
          title={label}
          className='max-w-20 min-w-0 truncate rounded-sm bg-muted px-1.5 text-xs text-muted-foreground'
        >
          {label}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          title={rest.join(', ')}
          className='shrink-0 text-xs text-muted-foreground tabular-nums'
        >
          +{rest.length}
        </span>
      )}
    </span>
  )
}

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
    <article className='relative grid gap-2 rounded-md border bg-card p-3 pe-11 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 ease-out hover:border-input/60 hover:shadow-sm'>
      {card.parent_key && (
        <span className='w-fit rounded-sm bg-muted px-1.5 text-xs text-muted-foreground tabular-nums'>
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
        className='line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring'
      >
        {card.summary}
      </Link>
      <div className='flex min-h-6 items-center gap-2 text-xs'>
        <TypeGlyph type={card.issue_type} />
        <span
          className='tracking-wide whitespace-nowrap text-subtle-foreground tabular-nums'
          title={`Updated ${timeAgo(card.updated_at)}`}
        >
          {card.key}
        </span>
        <SubtaskCount card={card} />
        <LabelChips labels={card.labels} />
        <span className='ms-auto flex items-center gap-2'>
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
