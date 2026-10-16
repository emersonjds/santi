import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { BoardColumn } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'

const plural = (count: number) => `${count} ${count === 1 ? 'issue' : 'issues'}`

const WipBadge = ({ limit, over }: { limit: number; over: boolean }) => (
  <span
    className={cn(
      'rounded-full px-2 tracking-normal normal-case tabular-nums',
      over ? 'bg-warning-bg text-warning' : 'bg-background'
    )}
    title={over ? `Over the limit of ${limit}` : undefined}
  >
    Max {limit}
  </span>
)

export const COLUMN_WIDTH = 'w-full shrink-0 md:max-w-104 md:min-w-72 md:flex-1'

/** 375px: one column at a time, picked here and kept in `?column=` (IA §10). */
export const ColumnPicker = ({
  projectKey,
  columns,
  shown,
}: {
  projectKey: string
  columns: BoardColumn[]
  shown: number
}) => (
  <nav aria-label='Columns' className='flex flex-wrap gap-1.5 md:hidden'>
    {columns.map((column) => (
      <Link
        key={column.id}
        to='/p/$key/board'
        params={{ key: projectKey }}
        search={(prev) => ({ ...prev, column: column.id })}
        replace
        aria-current={column.id === shown}
        className='inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold aria-[current=true]:border-primary aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground'
      >
        {column.name}
        <span className='text-muted-foreground tabular-nums'>
          {column.issue_count}
        </span>
      </Link>
    ))}
  </nav>
)

type ColumnShellProps = {
  column: BoardColumn
  narrowHidden: boolean
  /** KB-16: the admin's "…" next to the limit. */
  menu?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

/** Header (name, count of every card, D7 warn-only limit) around the card list. */
export const ColumnShell = ({
  column,
  narrowHidden,
  menu,
  footer,
  children,
}: ColumnShellProps) => (
  <section
    aria-label={column.name}
    data-issue-group={column.name}
    className={cn(
      'flex flex-col rounded-lg bg-muted',
      COLUMN_WIDTH,
      narrowHidden && 'max-md:hidden'
    )}
  >
    <h3 className='flex items-center gap-2 px-3 pt-3 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase'>
      <span className='truncate'>{column.name}</span>
      <span className='tabular-nums' aria-label={plural(column.issue_count)}>
        {column.issue_count}
      </span>
      <span className='ms-auto flex items-center gap-1'>
        {column.wip_limit != null && (
          <WipBadge limit={column.wip_limit} over={column.over_limit} />
        )}
        {menu}
      </span>
    </h3>
    {children}
    {footer}
  </section>
)
