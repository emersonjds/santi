import type { ComponentProps } from 'react'
import { Ellipsis } from 'lucide-react'
import { useT } from '@/shared/i18n/i18n'
import { SidebarGroupAction, SidebarMenuAction } from '@/shared/ui/sidebar'
import { messages } from './messages'

export const ProjectActionsButton = ({
  projectName,
  ...props
}: ComponentProps<typeof SidebarMenuAction> & { projectName: string }) => {
  const t = useT(messages)
  return (
    <SidebarMenuAction
      showOnHover
      aria-label={t('projectActions', { name: projectName })}
      className='top-0 size-11 after:hidden md:top-1 md:size-8'
      {...props}
    >
      <Ellipsis />
    </SidebarMenuAction>
  )
}

/** The Projects header buttons: 44px on touch, 20px with a pointer. */
export const HEADER_ACTION = 'top-2 size-11 after:hidden md:top-3.5 md:size-5'

export const ProjectsMenuButton = (
  props: ComponentProps<typeof SidebarGroupAction>
) => {
  const t = useT(messages)
  return (
    <SidebarGroupAction
      aria-label={t('projectsOptions')}
      title={t('projectsOptions')}
      className={HEADER_ACTION}
      {...props}
    >
      <Ellipsis />
    </SidebarGroupAction>
  )
}
