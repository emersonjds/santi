import type { ComponentProps } from 'react'
import { Ellipsis } from 'lucide-react'
import { SidebarMenuAction } from '@/shared/ui/sidebar'

export const ProjectActionsButton = ({
  projectName,
  ...props
}: ComponentProps<typeof SidebarMenuAction> & { projectName: string }) => (
  <SidebarMenuAction
    showOnHover
    aria-label={`Actions for ${projectName}`}
    className='top-0 size-11 after:hidden md:top-1 md:size-8'
    {...props}
  >
    <Ellipsis />
  </SidebarMenuAction>
)
