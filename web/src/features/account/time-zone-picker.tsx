import { type ReactNode, useState } from 'react'
import { Check } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

const plain = (text: string) => text.toLowerCase().replaceAll('_', ' ')

const zoneList = () =>
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : []

type TimeZonePickerProps = {
  browser: string
  current: string | null
  trigger: ReactNode
  onPick: (zone: string | null) => void
}

/** SAN-93 (lazy chunk): the browser's zone first, then every zone the browser knows. */
export const TimeZonePicker = ({
  browser,
  current,
  trigger,
  onPick,
}: TimeZonePickerProps) => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align='start'
        collisionPadding={16}
        className='w-(--radix-popover-trigger-width) p-0'
      >
        <Command
          defaultValue={current ?? browser}
          filter={(value, search) =>
            plain(value).includes(plain(search)) ? 1 : 0
          }
        >
          <CommandInput
            aria-label='Find a time zone'
            placeholder='Find a time zone'
            className='text-base md:text-sm'
          />
          <CommandList>
            <CommandEmpty>No time zone matches.</CommandEmpty>
            {[null, ...zoneList()].map((zone) => (
              <CommandItem
                key={zone ?? ''}
                value={zone ?? browser}
                onSelect={() => {
                  setOpen(false)
                  onPick(zone)
                }}
                className='min-h-11 [contain-intrinsic-size:auto_2.75rem] [content-visibility:auto] md:min-h-8'
              >
                <span className='truncate'>{zone ?? browser}</span>
                {zone === current && <Check className='ml-auto' />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
