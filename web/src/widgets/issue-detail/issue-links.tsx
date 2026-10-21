import { type RefObject, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2, Plus, X } from 'lucide-react'
import { PriorityGlyph, TypeGlyph } from '@/entities/issue/issue-glyphs'
import {
  RELATIONS,
  linkCandidatesQuery,
  linksQuery,
  projectOf,
  useCreateLink,
  useRemoveLink,
} from '@/entities/issue/issue-links'
import { StatusPill } from '@/entities/issue/status-pill'
import { projectsQuery } from '@/entities/project/project-queries'
import { AssigneeAvatar } from '@/entities/user/user-avatar'
import {
  type IssueLink,
  type Relation,
  fieldMessage,
  hasStatus,
} from '@/shared/api/client'
import { useDebouncedValue } from '@/shared/lib/use-debounced-value'
import { Button } from '@/shared/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { NativeSelect } from '@/shared/ui/native-select'
import { Skeleton } from '@/shared/ui/skeleton'

const SEARCH_DELAY = 200

const isRelation = (value: string): value is Relation =>
  Object.hasOwn(RELATIONS, value)

const heading = (label: string) => label[0].toUpperCase() + label.slice(1)

type LinkRowProps = {
  link: IssueLink
  failed: boolean
  onRemove: (button: HTMLElement) => void
}

/** On a phone the pill, priority, assignee and remove button take a second line. */
const LinkRow = ({ link: { issue }, failed, onRemove }: LinkRowProps) => {
  const project = projectOf(issue.key)
  return (
    <li className='grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 px-3 py-1 text-sm transition-colors duration-150 hover:bg-hover md:flex md:min-h-11 md:flex-wrap'>
      <TypeGlyph type={issue.issue_type} />
      <span className='whitespace-nowrap text-subtle-foreground tabular-nums'>
        {issue.key}
      </span>
      <Link
        to='/p/$key/issues/$number'
        params={{ key: project, number: issue.key.slice(project.length + 1) }}
        title={issue.summary}
        className='block min-w-0 flex-1 truncate leading-11 hover:underline md:leading-normal'
      >
        {issue.summary}
      </Link>
      <span className='col-span-3 flex min-w-0 items-center gap-2 md:contents'>
        <StatusPill
          status={{ name: issue.status_name, category: issue.status_category }}
        />
        <PriorityGlyph priority={issue.priority} />
        {issue.assignee_name && <AssigneeAvatar name={issue.assignee_name} />}
        <Button
          variant='ghost'
          size='icon'
          className='ms-auto size-11 md:ms-0 md:size-8'
          aria-label={`Remove link to ${issue.key}`}
          data-unlink
          onClick={(event) => onRemove(event.currentTarget)}
        >
          <X />
        </Button>
      </span>
      {failed && (
        <p className='col-span-3 text-sm text-destructive md:basis-full'>
          Could not remove the link.
        </p>
      )}
    </li>
  )
}

type AddLinkProps = {
  projectKey: string
  number: number
  /** This issue and the ones already linked. */
  exclude: Set<string>
  typeRef: RefObject<HTMLSelectElement | null>
  onClose: () => void
}

const AddLink = ({
  projectKey,
  number,
  exclude,
  typeRef,
  onClose,
}: AddLinkProps) => {
  const create = useCreateLink(projectKey, number)
  const [relation, setRelation] = useState<Relation>('blocks')
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim(), SEARCH_DELAY)
  const { data: projects = [] } = useQuery(projectsQuery)
  const { data: found } = useQuery({
    ...linkCandidatesQuery(
      projects.map((project) => project.key),
      q
    ),
    placeholderData: (previous) => previous,
  })
  const options = found?.filter((issue) => !exclude.has(issue.key))

  const pick = (key: string) =>
    create.mutate({ relation, issue: key }, { onSuccess: onClose })

  return (
    <form
      data-own-escape
      aria-busy={create.isPending}
      onSubmit={(event) => event.preventDefault()}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
      className='grid gap-1.5'
    >
      <fieldset
        disabled={create.isPending}
        className='grid gap-1.5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start'
      >
        <NativeSelect
          ref={typeRef}
          aria-label='Link type'
          autoFocus
          value={relation}
          onChange={(event) =>
            isRelation(event.target.value) && setRelation(event.target.value)
          }
        >
          {Object.entries(RELATIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <Command
          shouldFilter={false}
          className='h-auto border **:data-[slot=command-input-wrapper]:h-11 md:**:data-[slot=command-input-wrapper]:h-9'
        >
          <CommandInput
            aria-label='Issue to link'
            placeholder='Search by key or summary'
            className='text-base md:text-sm'
            value={text}
            onValueChange={setText}
          />
          {q && options && (
            <CommandList>
              <CommandEmpty>No issue found.</CommandEmpty>
              {options.map((issue) => (
                <CommandItem
                  key={issue.key}
                  value={issue.key}
                  onSelect={pick}
                  className='min-h-11 md:min-h-9'
                >
                  <span className='text-subtle-foreground tabular-nums'>
                    {issue.key}
                  </span>
                  <span className='truncate'>{issue.summary}</span>
                </CommandItem>
              ))}
            </CommandList>
          )}
        </Command>
        <Button
          type='button'
          variant='ghost'
          className='h-11 justify-self-start md:h-9'
          onClick={onClose}
        >
          {create.isPending && (
            <Loader2 aria-hidden='true' className='animate-spin' />
          )}
          Cancel
        </Button>
      </fieldset>
      {create.error && (
        <p className='text-sm text-destructive'>
          {hasStatus(create.error, 422)
            ? `Could not link the issues: ${fieldMessage(create.error)}.`
            : 'Could not link the issues.'}
        </p>
      )}
    </form>
  )
}

type IssueLinksProps = { projectKey: string; number: number }

/** SAN-157: links grouped by relation, after Subtasks and before Comments. */
export const IssueLinks = ({ projectKey, number }: IssueLinksProps) => {
  const { data: links = [], isPending } = useQuery(
    linksQuery(projectKey, number)
  )
  const remove = useRemoveLink(projectKey, number)
  const [adding, setAdding] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const typeRef = useRef<HTMLSelectElement>(null)
  const groups = Object.entries(RELATIONS)
    .map(([relation, label]) => ({
      label: heading(label),
      links: links.filter((link) => link.relation === relation),
    }))
    .filter((group) => group.links.length > 0)

  const close = () => {
    setAdding(false)
    addRef.current?.focus()
  }

  const removeLink = (link: IssueLink, button: HTMLElement) => {
    const buttons = [
      ...(sectionRef.current?.querySelectorAll<HTMLElement>('[data-unlink]') ??
        []),
    ]
    ;(buttons[buttons.indexOf(button) + 1] ?? addRef.current)?.focus()
    remove.mutate(link)
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby='issue-links'
      className='grid gap-2'
    >
      <div className='flex items-center justify-between gap-2'>
        <h3 id='issue-links' className='text-sm font-semibold'>
          Linked issues
        </h3>
        <Button
          ref={addRef}
          variant='ghost'
          className='h-11 md:h-8'
          aria-keyshortcuts='l'
          onClick={() => {
            setAdding(true)
            typeRef.current?.focus()
          }}
        >
          <Plus />
          Link issue
        </Button>
      </div>
      {adding && (
        <AddLink
          projectKey={projectKey}
          number={number}
          exclude={
            new Set([
              `${projectKey}-${number}`,
              ...links.map((link) => link.issue.key),
            ])
          }
          typeRef={typeRef}
          onClose={close}
        />
      )}
      {isPending && (
        <div aria-busy='true' className='grid gap-1'>
          <Skeleton className='h-11 w-full' />
          <Skeleton className='h-11 w-full' />
        </div>
      )}
      {groups.map((group) => (
        <div key={group.label} className='grid gap-1'>
          <h4 className='text-xs font-semibold text-muted-foreground'>
            {group.label}
          </h4>
          <ul className='grid grid-cols-1 divide-y rounded-md border'>
            {group.links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                failed={remove.isError && remove.variables.id === link.id}
                onRemove={(button) => removeLink(link, button)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
