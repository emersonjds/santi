import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { PointsPill } from '@/entities/issue/issue-card'
import { PriorityGlyph } from '@/entities/issue/issue-glyphs'
import { type CardUpdate, useUpdateRow } from '@/entities/issue/issue-mutations'
import { PRIORITY_LABEL, isPriority } from '@/entities/issue/labels'
import { membersQuery } from '@/entities/project/project-queries'
import { AssigneeAvatar } from '@/entities/user/user-avatar'
import type { Card } from '@/shared/api/client'
import { useHeldEditor } from '@/shared/lib/held-editor'
import { lockedSelect, useReadOnly } from '@/shared/lib/read-only'

type RowFieldProps = {
  card: Card
  projectKey: string
  /** The cache the edit patches at once: the backlog's by default, the board's on a card. */
  useUpdate?: (projectKey: string) => {
    mutate: (update: CardUpdate) => void
  }
}

/** R-8: a 44px hit area on a phone around a smaller face. */
const HIT =
  'relative z-10 grid shrink-0 cursor-pointer place-items-center max-md:-my-2.5 max-md:min-h-11 max-md:min-w-11'

const INPUT =
  'relative z-10 h-8 rounded-md border border-input bg-background px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** A press on a field stays off the card's drag handle. */
const holdPress = (event: PointerEvent) => event.stopPropagation()

const commitKeys =
  (old: string) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') event.currentTarget.value = old
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

/** BL-19, UI-19: the pencil swaps the summary link for a field, without opening the issue. */
export const RowSummary = ({
  card,
  projectKey,
  useUpdate = useUpdateRow,
  children,
}: RowFieldProps & { children: ReactNode }) => {
  const update = useUpdate(projectKey)
  const editor = useHeldEditor(`${card.key}:summary`)
  if (!editor.editing)
    return (
      <>
        {children}
        <button
          type='button'
          aria-label={`Edit summary of ${card.key}`}
          aria-keyshortcuts='e'
          onClick={() => editor.start(card.summary)}
          className='relative z-10 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring'
        >
          <Pencil className='size-3.5' />
        </button>
      </>
    )
  return (
    <input
      aria-label={`Summary of ${card.key}`}
      {...editor.field}
      required
      maxLength={255}
      className={`${INPUT} min-w-0 flex-1`}
      onKeyDown={commitKeys(card.summary)}
      onBlur={(event) => {
        const summary = event.currentTarget.value.trim()
        if (summary && summary !== card.summary)
          update.mutate({ card, change: { summary }, shown: { summary } })
        editor.stop()
      }}
    />
  )
}

const pointsText = (points?: number | null) =>
  points == null ? '' : String(points)

/** D11, D47: an estimate, cleared by emptying the field. */
export const RowPoints = ({
  card,
  projectKey,
  useUpdate = useUpdateRow,
}: RowFieldProps) => {
  const update = useUpdate(projectKey)
  const editor = useHeldEditor(`${card.key}:points`)
  if (!editor.editing)
    return (
      <button
        type='button'
        aria-label={
          card.points == null
            ? `Add points to ${card.key}`
            : `${card.points} points`
        }
        onClick={() => editor.start(pointsText(card.points))}
        onPointerDown={holdPress}
        className={`${HIT} rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        <PointsPill points={card.points} />
      </button>
    )
  return (
    <input
      aria-label={`Points of ${card.key}`}
      {...editor.field}
      type='number'
      min={0}
      step='any'
      inputMode='decimal'
      className={`${INPUT} w-20`}
      onPointerDown={holdPress}
      onKeyDown={commitKeys(pointsText(card.points))}
      onBlur={(event) => {
        if (event.currentTarget.validity.badInput) return editor.stop()
        const text = event.currentTarget.value
        const points = text === '' ? null : Number(text)
        if (text !== pointsText(card.points) && (points ?? 0) >= 0)
          update.mutate({ card, change: { points }, shown: { points } })
        editor.stop()
      }}
    />
  )
}

/** The avatar with the browser's own member picker laid over it: no menu chunk to load. */
export const RowAssignee = ({
  card,
  projectKey,
  useUpdate = useUpdateRow,
}: RowFieldProps) => {
  const update = useUpdate(projectKey)
  const note = useReadOnly()
  const { data: members = [] } = useQuery(membersQuery(projectKey))
  return (
    <span
      className={`${HIT} size-6 rounded-full focus-within:ring-2 focus-within:ring-ring`}
    >
      {card.assignee_name ? (
        <AssigneeAvatar name={card.assignee_name} />
      ) : (
        <span className='size-6 rounded-full border border-dashed border-subtle-foreground' />
      )}
      <select
        aria-label={`Assignee of ${card.key}`}
        value={card.assignee_id ?? ''}
        onChange={(event) => {
          const assignee_id = Number(event.target.value) || null
          const assignee_name =
            members.find((member) => member.user_id === assignee_id)
              ?.display_name ?? null
          update.mutate({
            card,
            change: { assignee_id },
            shown: { assignee_id, assignee_name },
          })
        }}
        {...lockedSelect(note)}
        className='absolute inset-0 cursor-pointer appearance-none opacity-0'
      >
        <option value=''>Unassigned</option>
        {members.map((member) => (
          <option key={member.user_id} value={member.user_id}>
            {member.display_name}
          </option>
        ))}
      </select>
    </span>
  )
}

/** D47: the glyph with the browser's own priority picker laid over it. */
export const RowPriority = ({
  card,
  projectKey,
  useUpdate = useUpdateRow,
}: RowFieldProps) => {
  const update = useUpdate(projectKey)
  const note = useReadOnly()
  return (
    <span
      className={`${HIT} size-6 rounded-md focus-within:ring-2 focus-within:ring-ring`}
    >
      <PriorityGlyph priority={card.priority} />
      <select
        aria-label={`Priority of ${card.key}`}
        value={card.priority}
        onPointerDown={holdPress}
        onChange={(event) => {
          const priority = event.target.value
          if (isPriority(priority))
            update.mutate({ card, change: { priority }, shown: { priority } })
        }}
        {...lockedSelect(note)}
        className='absolute inset-0 cursor-pointer appearance-none opacity-0'
      >
        {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </span>
  )
}
