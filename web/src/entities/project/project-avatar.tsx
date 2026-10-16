import { cn } from '@/shared/lib/utils'

export const ProjectAvatar = ({
  name,
  className,
}: {
  name: string
  className?: string
}) => (
  <span
    aria-hidden='true'
    className={cn(
      'inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground',
      className
    )}
  >
    {name.charAt(0).toUpperCase()}
  </span>
)
