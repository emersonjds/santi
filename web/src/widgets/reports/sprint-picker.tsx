import { type ReactNode, useState } from 'react'
import type { SprintTotals } from '@/shared/api/client'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { InProgress } from './sprint-history'

type SprintPickerProps = {
  sprints: SprintTotals[]
  trigger: ReactNode
  onPick: (sprintId: number) => void
}

/** The report header's combobox: the loaded history, active sprint first. */
export const SprintPicker = ({
  sprints,
  trigger,
  onPick,
}: SprintPickerProps) => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align='start'
        collisionPadding={16}
        className='w-72 max-w-[calc(100vw-2rem)] p-0'
      >
        <Command>
          <CommandInput
            aria-label='Find a sprint'
            placeholder='Find a sprint'
            className='text-base md:text-sm'
          />
          <CommandList>
            <CommandEmpty>No sprints match.</CommandEmpty>
            {sprints.map(({ sprint }) => (
              <CommandItem
                key={sprint.id}
                value={`${sprint.name} ${sprint.id}`}
                onSelect={() => {
                  setOpen(false)
                  onPick(sprint.id)
                }}
                className='min-h-11 md:min-h-8'
              >
                <span className='truncate'>{sprint.name}</span>
                {sprint.state === 'active' && <InProgress />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
