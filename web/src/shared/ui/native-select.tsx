import type { ComponentProps } from 'react'
import { lockedSelect, useReadOnly } from '@/shared/lib/read-only'
import { cn } from '@/shared/lib/utils'

/** The platform select: native keyboard and phone pickers, 44px on touch, 16px text against iOS zoom. */
export const NativeSelect = ({
  className,
  ...props
}: ComponentProps<'select'>) => (
  <select
    className={cn(
      'h-11 rounded-md border border-input bg-background px-2 text-base disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 md:h-9 md:text-sm',
      className
    )}
    {...props}
    {...lockedSelect(useReadOnly(), props['aria-describedby'])}
  />
)
