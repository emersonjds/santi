import type { ComponentProps } from 'react'
import { Ellipsis } from 'lucide-react'
import { SidebarGroupAction, SidebarMenuAction } from '@/shared/ui/sidebar'

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

/** The Projects header buttons: 44px on touch, 20px with a pointer. */
export const HEADER_ACTION = 'top-2 size-11 after:hidden md:top-3.5 md:size-5'

export const ProjectsMenuButton = (
  props: ComponentProps<typeof SidebarGroupAction>
) => (
  <SidebarGroupAction
    aria-label='Projects options'
    title='Projects options'
    className={HEADER_ACTION}
    {...props}
  >
    <Ellipsis />
  </SidebarGroupAction>
)
