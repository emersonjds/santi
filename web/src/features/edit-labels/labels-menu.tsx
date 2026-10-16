import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Plus } from 'lucide-react'
import { labelsQuery } from '@/entities/issue/board-query'
import { cn } from '@/shared/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { hasLabel, labelProblem, orderedLabels } from './labels'

type LabelsMenuProps = {
  projectKey: string
  value: string[]
  onAdd: (label: string) => void
  onRemove: (label: string) => void
  trigger: ReactNode
  className: string
  id?: string
}

/** The "Add label" popover: search, pick or create; Backspace in the empty search drops the last label. */
export const LabelsMenu = ({
  projectKey,
  value,
  onAdd,
  onRemove,
  trigger,
  className,
  id,
}: LabelsMenuProps) => {
  const { data: projectLabels = [] } = useQuery(labelsQuery(projectKey))
  const [search, setSearch] = useState('')
  const text = search.trim()
  const shown = orderedLabels(value, projectLabels).filter((label) =>
    label.toLowerCase().includes(text.toLowerCase())
  )
  const problem = labelProblem(text)
  const creatable = text !== '' && !problem && !hasLabel(shown, text)
  const add = (label: string) => {
    setSearch('')
    onAdd(label)
  }

  return (
    <Popover onOpenChange={() => setSearch('')}>
      <PopoverTrigger
        id={id}
        aria-haspopup='listbox'
        aria-label='Add label'
        className={className}
      >
        {trigger}
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
                onRemove(last)
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
                  className={cn(!hasLabel(value, label) && 'invisible')}
                />
                <span className='truncate'>{label}</span>
                {hasLabel(value, label) && (
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
  )
}
