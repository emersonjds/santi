import type { ReactNode } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  ArchiveProjectButton,
  TrashProjectButton,
} from '@/features/project-lifecycle/lifecycle-dialogs'
import { LeaveProjectButton } from '@/features/project/member-controls'
import { membersQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import type { Project } from '@/shared/api/client'

const LAST_ADMIN =
  'You are the last admin: make another member admin first, or delete the project.'

type RowProps = {
  label: string
  description: string
  descriptionId?: string
  children: ReactNode
}

const Row = ({ label, description, descriptionId, children }: RowProps) => (
  <div className='flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
    <div className='grid gap-0.5'>
      <p className='text-sm font-medium'>{label}</p>
      <p id={descriptionId} className='text-sm text-muted-foreground'>
        {description}
      </p>
    </div>
    <div className='shrink-0'>{children}</div>
  </div>
)

/** SAN-70: admins archive or delete; everyone but the last admin may leave. */
export const DangerZone = ({ project }: { project: Project }) => {
  const { data: members } = useSuspenseQuery(membersQuery(project.key))
  const { data: me } = useQuery(sessionQuery)
  const own = members.find((member) => member.user_id === me?.id)
  const admin = project.role === 'admin'
  const lastAdmin =
    admin && members.filter((member) => member.role === 'admin').length === 1
  const names = { projectKey: project.key, projectName: project.name }

  return (
    <section aria-labelledby='danger-zone' className='grid gap-3'>
      <h2 id='danger-zone' className='text-lg font-semibold'>
        Danger zone
      </h2>
      <div className='divide-y rounded-md border border-destructive/40'>
        {admin && project.state !== 'archived' && (
          <Row
            label='Archive project'
            description='Read-only for everyone and out of the lists; unarchive it any time.'
          >
            <ArchiveProjectButton {...names} />
          </Row>
        )}
        {admin && (
          <Row
            label='Delete project'
            description='Moves to trash for 60 days; you can restore it.'
          >
            <TrashProjectButton {...names} />
          </Row>
        )}
        {own && (
          <Row
            label='Leave project'
            description={
              lastAdmin
                ? LAST_ADMIN
                : 'You lose access until an admin invites you again.'
            }
            descriptionId='leave-project-reason'
          >
            <LeaveProjectButton
              projectKey={project.key}
              member={own}
              locked={lastAdmin}
              describedBy={lastAdmin ? 'leave-project-reason' : undefined}
            />
          </Row>
        )}
      </div>
    </section>
  )
}
