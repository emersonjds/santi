import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'

type FilterSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/** R-5: the phone's filters in a bottom sheet; each change applies at once. */
export const FilterSheet = ({
  open,
  onOpenChange,
  children,
}: FilterSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side='bottom'
      className='max-h-[85dvh] overflow-y-auto'
      // Focusing the text box would pop the phone keyboard over the sheet.
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <SheetHeader className='pb-0'>
        <SheetTitle>Filters</SheetTitle>
        <SheetDescription className='sr-only'>
          Narrow the issues shown.
        </SheetDescription>
      </SheetHeader>
      <div className='flex flex-wrap items-center gap-2 px-4'>{children}</div>
      <SheetFooter>
        <SheetClose asChild>
          <Button className='h-11'>Done</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)
