import { Suspense, lazy, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { lastProject } from '@/entities/project/last-project'
import { projectsQuery } from '@/entities/project/project-queries'
import { useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/button'
import { messages } from './messages'

const SIZE = 'h-11 min-w-11 md:h-9'

// Lazy: the form, zod and the dialog load on the first open (D39).
const CreateIssueDialog = lazy(() =>
  import('@/features/create-issue/create-issue-dialog').then((module) => ({
    default: module.CreateIssueDialog,
  }))
)

/** IA §5: the current project, else the last one opened, else the first. */
const preselect = (keys: string[], current?: string) => {
  const last = lastProject()
  // An archived project is missing from `keys`.
  if (current && keys.includes(current)) return current
  return last && keys.includes(last) ? last : keys[0]
}

export const CreateButton = () => {
  const { data: projects } = useQuery(projectsQuery)
  const { key } = useParams({ strict: false })
  const [open, setOpen] = useState(false)
  const t = useT(messages)
  const label = <span className='max-sm:sr-only'>{t('create')}</span>
  const ready = projects !== undefined && projects.length > 0

  if (projects?.length === 0)
    return (
      <Button asChild className={SIZE}>
        <Link to='/projects/new'>
          <Plus />
          {label}
        </Link>
      </Button>
    )
  return (
    <>
      <Button
        className={SIZE}
        disabled={!ready}
        // UI-32: `c` presses it (shortcut layer).
        aria-keyshortcuts='c'
        onClick={() => setOpen(true)}
      >
        <Plus />
        {label}
      </Button>
      {ready && open && (
        <Suspense fallback={null}>
          <CreateIssueDialog
            projectKey={preselect(
              projects.map((project) => project.key),
              key
            )}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
