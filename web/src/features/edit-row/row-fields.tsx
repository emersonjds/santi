import {
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  createContext,
  use,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useUpdateRow } from '@/entities/issue/issue-mutations'
import { membersQuery } from '@/entities/project/project-queries'
import { AssigneeAvatar } from '@/entities/user/user-avatar'
import type { Card } from '@/shared/api/client'

type RowFieldProps = { card: Card; projectKey: string }

const INPUT =
  'relative z-10 h-8 rounded-md border border-input bg-background px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring'

type Editors = {
  open: string | null
  setOpen: Dispatch<SetStateAction<string | null>>
  draft: { current: string }
}

const RowEditors = createContext<Editors | null>(null)

/** Held above the backlog's drag layer swap, which remounts every row: an open editor and its draft survive it. */
export const RowEditorsProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState<string | null>(null)
  const draft = useRef('')
  const editors = useMemo(() => ({ open, setOpen, draft }), [open])
  return <RowEditors value={editors}>{children}</RowEditors>
}

const useRowEditor = (id: string, value: string) => {
  const editors = use(RowEditors)
  if (!editors) throw new Error('A row editor needs a RowEditorsProvider')
  const { open, setOpen, draft } = editors
  return {
    editing: open === id,
    start: () => {
      draft.current = value
      setOpen(id)
    },
    stop: () => setOpen((current) => (current === id ? null : current)),
    field: {
      autoFocus: true,
      defaultValue: draft.current,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        draft.current = event.currentTarget.value
      },
    },
  }
}

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
  children,
}: RowFieldProps & { children: ReactNode }) => {
  const update = useUpdateRow(projectKey)
  const editor = useRowEditor(`${card.key}:summary`, card.summary)
  if (!editor.editing)
    return (
      <>
        {children}
        <button
          type='button'
          aria-label={`Edit summary of ${card.key}`}
          aria-keyshortcuts='e'
          onClick={editor.start}
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

/** D11: a row's estimate, cleared by emptying the field. */
export const RowPoints = ({ card, projectKey }: RowFieldProps) => {
  const update = useUpdateRow(projectKey)
  const editor = useRowEditor(`${card.key}:points`, pointsText(card.points))
  if (!editor.editing)
    return (
      <button
        type='button'
        aria-label={
          card.points == null
            ? `Add points to ${card.key}`
            : `${card.points} points`
        }
        onClick={editor.start}
        className='relative z-10 min-w-7 rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground tabular-nums outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
      >
        {card.points ?? '–'}
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
      onKeyDown={commitKeys(pointsText(card.points))}
      onBlur={(event) => {
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
export const RowAssignee = ({ card, projectKey }: RowFieldProps) => {
  const update = useUpdateRow(projectKey)
  const { data: members = [] } = useQuery(membersQuery(projectKey))
  return (
    <span className='relative z-10 grid size-6 shrink-0 place-items-center rounded-full focus-within:ring-2 focus-within:ring-ring'>
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
