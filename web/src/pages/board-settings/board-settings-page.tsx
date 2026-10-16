import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ForbiddenPage } from '@/pages/forbidden/forbidden-page'
import { DoneWindow } from '@/features/board-settings/done-window'
import { projectQuery } from '@/entities/project/project-queries'
import { Skeleton } from '@/shared/ui/skeleton'

// Lazy: dnd-kit rides with the editor, outside the route's first-visit JS (D39).
const LayoutEditor = lazy(() =>
  import('@/features/board-settings/layout-editor').then((module) => ({
    default: module.LayoutEditor,
  }))
)

/** IA §3, §9: columns, statuses and the done window, for admins only. */
export const BoardSettingsPage = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key' })
  const { data: project } = useSuspenseQuery(projectQuery(key))
  if (project.role !== 'admin') return <ForbiddenPage projectKey={key} />
  const kanban = project.board_type === 'kanban'

  return (
    <div className='mx-auto grid w-full max-w-3xl gap-8 px-4 py-6 sm:px-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>Board settings</h2>
        <Link
          to='/p/$key/settings/members'
          params={{ key }}
          className='inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline'
        >
          Members
        </Link>
      </div>
      <Suspense fallback={<Skeleton className='h-96' />}>
        <LayoutEditor projectKey={key} kanban={kanban} />
        {kanban && <DoneWindow projectKey={key} />}
      </Suspense>
    </div>
  )
}
