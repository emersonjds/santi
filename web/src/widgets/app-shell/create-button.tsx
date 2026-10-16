import { Suspense, lazy, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { lastProject } from '@/entities/project/last-project'
import { projectsQuery } from '@/entities/project/project-queries'
import { Button } from '@/shared/ui/button'

const SIZE = 'h-11 md:h-9'
const LABEL = <span className='max-sm:sr-only'>Create</span>

// Lazy: the form, zod and the dialog load on the first open (D39).
const CreateIssueDialog = lazy(() =>
  import('@/features/create-issue/create-issue-dialog').then((module) => ({
    default: module.CreateIssueDialog,
  }))
)

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** IA §5: the current project, else the last one opened, else the first. */
const preselect = (keys: string[], current?: string) => {
  const last = lastProject()
  return current ?? (last && keys.includes(last) ? last : keys[0])
}

export const CreateButton = () => {
  const { data: projects } = useQuery(projectsQuery)
  const { key } = useParams({ strict: false })
  const [open, setOpen] = useState(false)
  const ready = projects !== undefined && projects.length > 0

  useEffect(() => {
    if (!ready) return
    // UI-32: `c` opens it from anywhere but a field being typed in.
    const create = (event: KeyboardEvent) => {
      if (event.key !== 'c' || event.metaKey || event.ctrlKey || event.altKey)
        return
      if (isTyping(event.target)) return
      event.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', create)
    return () => document.removeEventListener('keydown', create)
  }, [ready])

  if (projects?.length === 0)
    return (
      <Button asChild className={SIZE}>
        <Link to='/projects/new'>
          <Plus />
          {LABEL}
        </Link>
      </Button>
    )
  return (
    <>
      <Button
        className={SIZE}
        disabled={!ready}
        aria-keyshortcuts='c'
        onClick={() => setOpen(true)}
      >
        <Plus />
        {LABEL}
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
