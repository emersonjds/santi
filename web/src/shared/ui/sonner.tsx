import { useEffect } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { toasterMounted } from '@/shared/lib/toast'

export function Toaster({ ...props }: ToasterProps) {
  // Runs after Sonner's own effect has subscribed.
  useEffect(toasterMounted, [])
  return (
    <Sonner
      theme='light'
      className='toaster group [&_div[data-content]]:w-full'
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
