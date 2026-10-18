import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/utils'
import { labelTone } from './label-tone'

const labelChipVariants = cva(
  'inline-flex max-w-full min-w-0 items-center font-medium',
  {
    variants: {
      size: {
        default: 'rounded-md px-2 text-sm',
        compact: 'rounded-sm px-1.5 text-xs',
      },
    },
    defaultVariants: { size: 'default' },
  }
)

const NAME_WIDTH = { default: 'max-w-48', compact: 'max-w-20' }

type LabelChipProps = ComponentProps<'span'> &
  VariantProps<typeof labelChipVariants> & { name: string }

export const LabelChip = ({
  name,
  size,
  className,
  children,
  ...props
}: LabelChipProps) => (
  <span
    data-slot='label-chip'
    className={cn(labelChipVariants({ size }), labelTone(name), className)}
    {...props}
  >
    <span
      title={name}
      className={cn('truncate', NAME_WIDTH[size ?? 'default'])}
    >
      {name}
    </span>
    {children}
  </span>
)
