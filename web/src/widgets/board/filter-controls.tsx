import { useEffect, useState } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  type BoardSearch,
  epicsQuery,
  labelsQuery,
} from '@/entities/issue/board-query'
import { TYPE_LABEL, isIssueType } from '@/entities/issue/labels'
import { membersQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import { UserAvatar } from '@/entities/user/user-avatar'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'

export const TOGGLE =
  'inline-flex h-11 shrink-0 items-center rounded-md border px-3 text-sm font-medium whitespace-nowrap hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground md:h-9'

const toggled = <Value,>(values: Value[], value: Value) =>
  values.includes(value)
    ? values.filter((other) => other !== value)
    : [...values, value]

const orNothing = <Value,>(values: Value[]) =>
  values.length > 0 ? values : undefined

// The current page: the board, the backlog and search share these filters (D18).
const HERE = { to: '.' } as const

type FilterProps = { projectKey: string; search: BoardSearch }

const useMe = () => useSuspenseQuery(sessionQuery).data

export const AssigneeToggles = ({ projectKey, search }: FilterProps) => {
  const { data: members } = useSuspenseQuery(membersQuery(projectKey))
  const assignee = search.assignee ?? []
  return (
    <div className='flex max-w-full min-w-0 -space-x-1 overflow-x-auto p-0.5'>
      {members.map((member) => (
        <Link
          key={member.user_id}
          {...HERE}
          search={(prev) => ({
            ...prev,
            assignee: orNothing(toggled(assignee, member.user_id)),
          })}
          role='button'
          aria-pressed={assignee.includes(member.user_id)}
          aria-label={`Issues of ${member.display_name}`}
          className='shrink-0 rounded-full p-1 ring-2 ring-transparent outline-none hover:z-10 focus-visible:ring-ring aria-pressed:z-10 aria-pressed:ring-primary md:p-0.5'
        >
          <UserAvatar
            name={member.display_name}
            className='size-9 ring-2 ring-background md:size-8'
          />
        </Link>
      ))}
    </div>
  )
}

export const OnlyMineToggle = ({ search }: { search: BoardSearch }) => {
  const me = useMe()
  const assignee = search.assignee ?? []
  const onlyMine = assignee.length === 1 && assignee[0] === me?.id
  return (
    <Link
      {...HERE}
      search={(prev) => ({
        ...prev,
        assignee: onlyMine || !me ? undefined : [me.id],
      })}
      role='button'
      aria-pressed={onlyMine}
      className={TOGGLE}
    >
      Only my issues
    </Link>
  )
}

export const RecentToggle = ({ search }: { search: BoardSearch }) => (
  <Link
    {...HERE}
    search={(prev) => ({
      ...prev,
      recently_updated: search.recently_updated ? undefined : true,
    })}
    role='button'
    aria-pressed={search.recently_updated === true}
    className={TOGGLE}
  >
    Recently updated
  </Link>
)

/** Sends the summary/key text to the URL once typing pauses for 300 ms. */
export const TextFilter = ({ q }: { q?: string }) => {
  const navigate = useNavigate()
  const [text, setText] = useState(q ?? '')
  const [shown, setShown] = useState(q)
  // Follows the URL (Clear filters, back button) without undoing a trailing space being typed.
  if (q !== shown) {
    setShown(q)
    if ((q ?? '') !== text.trim()) setText(q ?? '')
  }
  useEffect(() => {
    const next = text.trim() || undefined
    if (next === q) return
    const timer = setTimeout(
      () =>
        void navigate({
          ...HERE,
          search: (prev) => ({ ...prev, q: next }),
          replace: true,
        }),
      300
    )
    return () => clearTimeout(timer)
  }, [text, q, navigate])
  return (
    <Input
      type='search'
      aria-label='Filter issues'
      placeholder='Filter issues'
      value={text}
      onChange={({ target }) => setText(target.value)}
      className='h-11 w-full md:h-9 md:w-44'
    />
  )
}

type MultiSelectProps<Value extends string> = {
  label: string
  options: { value: Value; label: string }[]
  selected: Value[]
  onChange: (selected: Value[] | undefined) => void
}

/** A menu of checkboxes that stays open while the user picks several (OR within a kind, D3). */
const MultiSelect = <Value extends string>({
  label,
  options,
  selected,
  onChange,
}: MultiSelectProps<Value>) => (
  <DropdownMenu>
    <DropdownMenuTrigger className={TOGGLE}>
      {label}
      {selected.length > 0 && (
        <span className='ms-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums'>
          {selected.length}
        </span>
      )}
    </DropdownMenuTrigger>
    <DropdownMenuContent align='start'>
      {options.map((option) => (
        <DropdownMenuCheckboxItem
          key={option.value}
          checked={selected.includes(option.value)}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() =>
            onChange(orNothing(toggled(selected, option.value)))
          }
          className='min-h-11 md:min-h-8'
        >
          {option.label}
        </DropdownMenuCheckboxItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
)

const TYPES = Object.entries(TYPE_LABEL).flatMap(([value, label]) =>
  isIssueType(value) ? [{ value, label }] : []
)

export const TypeFilter = ({ search }: { search: BoardSearch }) => {
  const navigate = useNavigate()
  return (
    <MultiSelect
      label='Type'
      options={TYPES}
      selected={search.type ?? []}
      onChange={(type) =>
        void navigate({ ...HERE, search: (prev) => ({ ...prev, type }) })
      }
    />
  )
}

/** SB-25: shown once the project has labels; a selected label stays listed. */
export const LabelFilter = ({ projectKey, search }: FilterProps) => {
  const navigate = useNavigate()
  const { data: labels = [] } = useQuery(labelsQuery(projectKey))
  const selected = search.label ?? []
  const options = [...new Set([...labels, ...selected])]
  if (options.length === 0) return null
  return (
    <MultiSelect
      label='Label'
      options={options.map((label) => ({ value: label, label }))}
      selected={selected}
      onChange={(label) =>
        void navigate({ ...HERE, search: (prev) => ({ ...prev, label }) })
      }
    />
  )
}

/** SB-25: shown once the project has an epic; "No epic" is `?epic=none`. */
export const EpicFilter = ({ projectKey, search }: FilterProps) => {
  const navigate = useNavigate()
  const { data: epics = [] } = useQuery(epicsQuery(projectKey))
  if (epics.length === 0 && !search.epic) return null
  return (
    <NativeSelect
      aria-label='Epic'
      value={search.epic ?? ''}
      onChange={({ target }) =>
        void navigate({
          ...HERE,
          search: (prev) => ({ ...prev, epic: target.value || undefined }),
        })
      }
      className='max-w-56'
    >
      <option value=''>Any epic</option>
      <option value='none'>No epic</option>
      {epics.map((epic) => (
        <option key={epic.key} value={epic.key}>
          {epic.key} {epic.summary}
        </option>
      ))}
    </NativeSelect>
  )
}

type ClearFiltersProps = { count: number; keepText: boolean }

export const ClearFilters = ({ count, keepText }: ClearFiltersProps) => (
  <Link
    {...HERE}
    search={({ column, q }) => ({ column, q: keepText ? q : undefined })}
    className='inline-flex h-11 shrink-0 items-center px-2 text-sm font-medium whitespace-nowrap text-primary hover:underline md:h-9'
  >
    Clear filters ({count})
  </Link>
)
