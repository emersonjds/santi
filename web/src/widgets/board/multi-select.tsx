import type { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

type MultiSelectProps = {
  trigger: ReactNode
  className: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (selected: string[] | undefined) => void
}

const toggled = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((other) => other !== value)
    : [...values, value]

/** A menu of checkboxes that stays open while the user picks several (OR within a kind, D3). */
export const MultiSelect = ({
  trigger,
  className,
  options,
  selected,
  onChange,
}: MultiSelectProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger className={className}>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align='start'>
      {options.map((option) => {
        const next = toggled(selected, option.value)
        return (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onChange(next.length > 0 ? next : undefined)}
            className='min-h-11 md:min-h-8'
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        )
      })}
    </DropdownMenuContent>
  </DropdownMenu>
)
