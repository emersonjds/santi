import type { CSSProperties, ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'

type SidebarSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  side: 'left' | 'right'
  width: string
  children: ReactNode
}

export const SidebarSheet = ({
  open,
  onOpenChange,
  side,
  width,
  children,
}: SidebarSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      data-sidebar='sidebar'
      data-slot='sidebar'
      data-mobile='true'
      className='w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden'
      style={{ '--sidebar-width': width } as CSSProperties}
      side={side}
    >
      <SheetHeader className='sr-only'>
        <SheetTitle>Sidebar</SheetTitle>
        <SheetDescription>Displays the mobile sidebar.</SheetDescription>
      </SheetHeader>
      <div className='flex h-full w-full flex-col'>{children}</div>
    </SheetContent>
  </Sheet>
)
