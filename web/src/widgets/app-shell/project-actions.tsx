import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  Link2,
  LogOut,
  Settings,
  Star,
  Trash2,
  UserPlus,
} from 'lucide-react'
import {
  ArchiveProjectButton,
  TrashProjectButton,
} from '@/features/project-lifecycle/lifecycle-dialogs'
import { LeaveProjectButton } from '@/features/project/member-controls'
import { useStarProject } from '@/features/star/use-star'
import { BOARD_TYPE_LABEL } from '@/entities/project/labels'
import {
  LAST_ADMIN,
  LAST_ADMIN_SHORT,
  leaveRules,
} from '@/entities/project/leave-rules'
import { membersQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import type { MyProject } from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ProjectActionsButton } from './project-actions-button'

const ROW = 'h-11 md:h-8'

type Dialog = 'archive' | 'trash' | 'leave'

const copyLink = (key: string) =>
  navigator.clipboard.writeText(`${location.origin}/p/${key}`).then(
    () => toast.success(`Copied the link to ${key}`),
    () => toast.error(`Couldn't copy the link to ${key}`)
  )

/** SAN-91, UI-63: the sidebar row's "…" (lazy chunk); the dialogs are the danger zone's (SAN-70). */
export const ProjectActions = ({
  project,
  onNavigate,
  onStar,
}: {
  project: MyProject
  onNavigate: () => void
  onStar?: () => void
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
  const star = useStarProject()
  const admin = project.role === 'admin'
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
          <ProjectActionsButton ref={trigger} projectName={project.name} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-60'>
          <DropdownMenuItem
            className={ROW}
            onSelect={() => {
              onStar?.()
              star.mutate({ key: project.key, starred: !project.starred })
            }}
          >
            <Star />
            {project.starred ? 'Unstar project' : 'Star project'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={ROW}
            onSelect={() => void copyLink(project.key)}
          >
            <Link2 />
            Copy link
          </DropdownMenuItem>
          {admin && (
            <DropdownMenuItem asChild className={ROW}>
              <Link
                to='/p/$key/settings/members'
                params={{ key: project.key }}
                onClick={onNavigate}
              >
                <UserPlus />
                Add people
              </Link>
            </DropdownMenuItem>
          )}
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
          {admin && (
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
            title={lastAdmin ? LAST_ADMIN : undefined}
            onSelect={() => setDialog('leave')}
          >
            <LogOut />
            Leave project
          </DropdownMenuItem>
          {lastAdmin && (
            <p className='px-2 pb-1.5 text-xs text-muted-foreground'>
              {LAST_ADMIN_SHORT}
            </p>
          )}
          <DropdownMenuSeparator />
          <p className='px-2 py-1.5 text-xs text-muted-foreground'>
            {BOARD_TYPE_LABEL[project.board_type]} project
          </p>
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
