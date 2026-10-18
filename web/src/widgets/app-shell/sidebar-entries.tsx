import { type ReactNode, Suspense } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { LucideIcon } from 'lucide-react'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/shared/ui/sidebar'

export type Flyout = 'Recent' | 'Starred' | 'More projects'

export type FlyoutState = {
  open: Flyout | null
  setOpen: (update: (current: Flyout | null) => Flyout | null) => void
}

/** UI-56: one flyout open at a time; Radix gives `aria-expanded` and the focus back to the trigger. */
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
  return (
    <SidebarMenuItem>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={(next) =>
          flyouts.setOpen((current) =>
            next ? name : current === name ? null : current
          )
        }
      >
        <SidebarMenuButton asChild className='pointer-events-auto h-10'>
          <DialogPrimitive.Trigger data-flyout-trigger=''>
            <Icon />
            <span>{name}</span>
          </DialogPrimitive.Trigger>
        </SidebarMenuButton>
        {open && <Suspense>{children}</Suspense>}
      </DialogPrimitive.Root>
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
