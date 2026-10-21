import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { DoneWindow } from '@/features/board-settings/done-window'
import { projectQuery } from '@/entities/project/project-queries'
import { WriteLock } from '@/entities/project/write-lock'
import { lockedButton, useReadOnly } from '@/shared/lib/read-only'
import { Skeleton } from '@/shared/ui/skeleton'

// Lazy: dnd-kit rides with the editor, outside the route's first-visit JS (D39).
const LayoutEditor = lazy(() =>
  import('@/features/board-settings/layout-editor').then((module) => ({
    default: module.LayoutEditor,
  }))
)

// Lazy: the lifecycle confirmations bring the Radix dialog stack (D39).
const DangerZone = lazy(() =>
  import('./danger-zone').then((module) => ({ default: module.DangerZone }))
)

const LINK =
  'inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline aria-disabled:cursor-not-allowed aria-disabled:no-underline aria-disabled:opacity-50'

/** IA §3, §9: columns, statuses and the done window for admins; the danger zone for everyone. */
export const BoardSettingsPage = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key' })
  const { data: project } = useSuspenseQuery(projectQuery(key))
  const kanban = project.board_type === 'kanban'

  return (
    <div className='mx-auto grid w-full max-w-3xl gap-8 px-4 py-6 sm:px-6'>
      {project.role === 'admin' && (
        <WriteLock projectKey={key}>
          <BoardSettings projectKey={key} kanban={kanban} />
        </WriteLock>
      )}
      <Suspense fallback={<Skeleton className='h-40' />}>
        <DangerZone project={project} />
      </Suspense>
    </div>
  )
}

const BoardSettings = ({
  projectKey: key,
  kanban,
}: {
  projectKey: string
  kanban: boolean
}) => {
  const locked = lockedButton(useReadOnly())
  return (
    <>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>Board settings</h2>
        <span className='flex gap-4'>
          <Link to='/p/$key/settings/members' params={{ key }} className={LINK}>
            Members
          </Link>
          <Link
            to='/p/$key/settings/import'
            params={{ key }}
            className={LINK}
            {...locked}
          >
            Import issues
          </Link>
        </span>
      </div>
      <Suspense fallback={<Skeleton className='h-96' />}>
        <LayoutEditor projectKey={key} kanban={kanban} />
        {kanban && <DoneWindow projectKey={key} />}
      </Suspense>
    </>
  )
}
