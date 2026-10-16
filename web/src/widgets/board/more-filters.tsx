import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

type MoreFiltersProps = { className: string; children: ReactNode }

/** The filters that do not fit one desktop row below 1280px. */
export const MoreFilters = ({ className, children }: MoreFiltersProps) => (
  <Popover>
    <PopoverTrigger className={className}>More filters</PopoverTrigger>
    <PopoverContent
      align='start'
      className='flex w-auto flex-col items-start gap-2 p-2'
    >
      {children}
    </PopoverContent>
  </Popover>
)
