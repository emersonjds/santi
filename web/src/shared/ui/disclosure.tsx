import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/** A native details/summary box with a chevron that turns when it opens. */
export const Disclosure = ({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) => (
  <details className='group rounded-md border px-3'>
    <summary className='flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden'>
      <ChevronDown
        aria-hidden='true'
        className='size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-0'
      />
      {title}
    </summary>
    {children}
  </details>
)
