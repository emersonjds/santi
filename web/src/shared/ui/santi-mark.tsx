import { cn } from '@/shared/lib/utils'

export const SantiMark = ({ className }: { className?: string }) => (
  <img
    src='/brand/mark.svg'
    alt=''
    width={32}
    height={32}
    className={cn('size-8 shrink-0', className)}
  />
)
