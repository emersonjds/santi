import { type ReactNode, Suspense, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/shared/ui/sidebar'
import { FlyoutControl } from './flyout-control'

export type Flyout = 'Recent' | 'Starred' | 'More projects'

export type FlyoutState = {
  open: Flyout | null
  setOpen: (update: (current: Flyout | null) => Flyout | null) => void
}

/** UI-56: one flyout open at a time; the dialog itself lives in the lazy flyout body. */
export const FlyoutEntry = ({
  name,
  icon: Icon,
  flyouts,
  children,
}: {
  name: Flyout
  icon: LucideIcon
  flyouts: FlyoutState
  children: ReactNode
}) => {
  const open = flyouts.open === name
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () =>
    flyouts.setOpen((current) => (current === name ? null : current))
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        ref={trigger}
        data-flyout-trigger=''
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={() =>
          flyouts.setOpen((current) => (current === name ? null : name))
        }
        className='pointer-events-auto h-10'
      >
        <Icon />
        <span>{name}</span>
      </SidebarMenuButton>
      {open && (
        <FlyoutControl value={{ close, trigger }}>
          <Suspense>{children}</Suspense>
        </FlyoutControl>
      )}
    </SidebarMenuItem>
  )
}

export const CURRENT =
  'aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:shadow-[inset_3px_0_0_var(--color-primary)]'

export const ProjectSkeletons = () => (
  <SidebarMenu>
    {[0, 1, 2].map((row) => (
      <SidebarMenuItem key={row}>
        <SidebarMenuSkeleton showIcon className='h-10' />
      </SidebarMenuItem>
    ))}
  </SidebarMenu>
)
