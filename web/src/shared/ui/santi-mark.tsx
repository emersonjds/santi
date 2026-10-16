import { cn } from '@/shared/lib/utils'

export const SantiMark = ({ className }: { className?: string }) => (
  <span
    aria-hidden='true'
    className={cn(
      'inline-flex size-8 items-center justify-center rounded-lg bg-primary text-lg leading-none font-bold text-primary-foreground',
      className
    )}
  >
    s
  </span>
)
