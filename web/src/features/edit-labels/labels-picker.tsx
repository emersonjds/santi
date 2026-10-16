import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Plus, X } from 'lucide-react'
import { labelsQuery } from '@/entities/issue/board-query'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

const DEFAULT_LABELS = [
  'bug',
  'feature',
  'frontend',
  'backend',
  'mobile',
  'infra',
  'design',
  'docs',
  'tech-debt',
  'security',
  'performance',
  'blocked',
]

// Mirrors normalize_labels in issues/domain.rs; the server stays the authority.
const MAX_LENGTH = 50

const has = (labels: string[], label: string) =>
  labels.some((each) => each.toLowerCase() === label.toLowerCase())

/** The issue's labels, then the project's A-Z, then the defaults not used yet; one entry per word whatever its case. */
const ordered = (selected: string[], project: string[]) =>
  [
    ...selected,
    ...[...project].sort((a, b) => a.localeCompare(b)),
    ...DEFAULT_LABELS,
  ].reduce<string[]>(
    (list, label) => (has(list, label) ? list : [...list, label]),
    []
  )

const problemOf = (text: string) => {
  if (/\s/.test(text)) return 'Labels are single words, no spaces.'
  if ([...text].length > MAX_LENGTH)
    return `Use at most ${MAX_LENGTH} characters.`
  return null
}

type LabelsPickerProps = {
  projectKey: string
  value: string[]
  onChange: (labels: string[]) => void
  id?: string
}

/** Chips with an x each, and an "Add label" popover that searches, picks or creates. */
export const LabelsPicker = ({
  projectKey,
  value,
  onChange,
  id,
}: LabelsPickerProps) => {
  const { data: projectLabels = [] } = useQuery(labelsQuery(projectKey))
  const [search, setSearch] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const text = search.trim()
  const shown = ordered(value, projectLabels).filter((label) =>
    label.toLowerCase().includes(text.toLowerCase())
  )
  const problem = problemOf(text)
  const creatable = text !== '' && !problem && !has(shown, text)

  const add = (label: string) => {
    setSearch('')
    if (has(value, label)) return
    onChange([...value, label])
    setAnnouncement(`Label ${label} added`)
  }
  const remove = (label: string) => {
    onChange(value.filter((each) => each !== label))
    setAnnouncement(`Label ${label} removed`)
  }

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-1'>
      {value.map((label) => (
        <span
          key={label}
          className='inline-flex max-w-full min-w-0 items-center rounded-md bg-muted ps-2 text-sm text-muted-foreground'
        >
          <span title={label} className='max-w-48 truncate'>
            {label}
          </span>
          <button
            type='button'
            aria-label={`Remove label ${label}`}
            onClick={() => remove(label)}
            className='grid size-11 shrink-0 place-items-center rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-6'
          >
            <X className='size-3.5' aria-hidden='true' />
          </button>
        </span>
      ))}
      <Popover onOpenChange={() => setSearch('')}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant='ghost'
            aria-haspopup='listbox'
            aria-label='Add label'
            className='h-11 px-2 text-muted-foreground md:h-7'
          >
            <Plus aria-hidden='true' />
            Add label
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align='start'
          collisionPadding={16}
          className='w-72 max-w-[calc(100vw-2rem)] p-0'
        >
          <Command shouldFilter={false}>
            <CommandInput
              aria-label='Search labels'
              placeholder='Search or create'
              className='text-base md:text-sm'
              value={search}
              onValueChange={setSearch}
              onKeyDown={(event) => {
                const last = value.at(-1)
                if (event.key === 'Backspace' && search === '' && last)
                  remove(last)
              }}
            />
            {problem && (
              <p className='px-3 pt-2 text-sm text-destructive'>{problem}</p>
            )}
            <CommandList>
              {!problem && <CommandEmpty>No labels match.</CommandEmpty>}
              {shown.map((label) => (
                <CommandItem
                  key={label}
                  value={label}
                  onSelect={() => add(label)}
                  className='min-h-11 md:min-h-8'
                >
                  <Check
                    aria-hidden='true'
                    className={cn(!has(value, label) && 'invisible')}
                  />
                  <span className='truncate'>{label}</span>
                  {has(value, label) && (
                    <span className='sr-only'> (added)</span>
                  )}
                </CommandItem>
              ))}
              {creatable && (
                <CommandItem
                  value={`Create label ${text}`}
                  onSelect={() => add(text)}
                  className='min-h-11 md:min-h-8'
                >
                  <Plus aria-hidden='true' />
                  <span className='truncate'>Create label {text}</span>
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p role='status' className='sr-only'>
        {announcement}
      </p>
    </div>
  )
}
