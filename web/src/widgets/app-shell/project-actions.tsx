import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  Ellipsis,
  Link2,
  LogOut,
  Settings,
  Trash2,
} from 'lucide-react'
import {
  ArchiveProjectButton,
  TrashProjectButton,
} from '@/features/project-lifecycle/lifecycle-dialogs'
import { LeaveProjectButton } from '@/features/project/member-controls'
import { LAST_ADMIN, leaveRules } from '@/entities/project/leave-rules'
import { membersQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import type { Project } from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { SidebarMenuAction } from '@/shared/ui/sidebar'

const ROW = 'h-11 md:h-8'

type Dialog = 'archive' | 'trash' | 'leave'

const copyLink = (key: string) =>
  navigator.clipboard.writeText(`${location.origin}/p/${key}`).then(
    () => toast.success(`Copied the link to ${key}`),
    () => toast.error(`Couldn't copy the link to ${key}`)
  )

/** SAN-91: the sidebar row's "…"; the dialogs are the danger zone's (SAN-70). */
export const ProjectActions = ({
  project,
  onNavigate,
}: {
  project: Project
  onNavigate: () => void
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const { data: members } = useQuery({
    ...membersQuery(project.key),
    enabled: menuOpen,
  })
  const { data: me } = useQuery(sessionQuery)
  const { own, lastAdmin } = leaveRules(project.role, members, me?.id)
  const admin = project.role === 'admin'
  const reasonId = `leave-reason-${project.key}`
  const state = {
    projectKey: project.key,
    projectName: project.name,
    open: true,
    onOpenChange: (open: boolean) => open || setDialog(null),
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      trigger.current?.focus()
    },
  }

  return (
    <>
      <DropdownMenu onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            ref={trigger}
            showOnHover
            aria-label={`Actions for ${project.name}`}
            className='top-0 size-11 after:hidden md:top-1 md:size-8'
          >
            <Ellipsis />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-60'>
          <DropdownMenuItem
            className={ROW}
            onSelect={() => void copyLink(project.key)}
          >
            <Link2 />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={ROW}>
            <Link
              to='/p/$key/settings'
              params={{ key: project.key }}
              onClick={onNavigate}
            >
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {admin && project.state !== 'archived' && (
            <DropdownMenuItem
              className={ROW}
              onSelect={() => setDialog('archive')}
            >
              <Archive />
              Archive project
            </DropdownMenuItem>
          )}
          {admin && (
            <DropdownMenuItem
              className={ROW}
              variant='destructive'
              onSelect={() => setDialog('trash')}
            >
              <Trash2 />
              Delete project
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className={ROW}
            disabled={!own || lastAdmin}
            aria-describedby={lastAdmin ? reasonId : undefined}
            onSelect={() => setDialog('leave')}
          >
            <LogOut />
            Leave project
          </DropdownMenuItem>
          {lastAdmin && (
            <p
              id={reasonId}
              className='px-2 pb-1.5 text-xs text-muted-foreground'
            >
              {LAST_ADMIN}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'archive' && <ArchiveProjectButton {...state} />}
      {dialog === 'trash' && <TrashProjectButton {...state} />}
      {dialog === 'leave' && own && (
        <LeaveProjectButton {...state} member={own} locked={false} />
      )}
    </>
  )
}
