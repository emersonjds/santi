import { useState } from 'react'
import type { InfiniteData } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { myIssuesQuery, myProjectsQuery } from '@/entities/home/home-queries'
import {
  type HomeIssue,
  type MyItem,
  type MyProject,
  api,
  okOrThrow,
} from '@/shared/api/client'
import { useOptimisticWrite } from '@/shared/lib/optimistic-write'
import { cn } from '@/shared/lib/utils'

type Toggle = { key: string; starred: boolean }

const writeStar = async ({ key, starred }: Toggle) =>
  okOrThrow(
    starred
      ? await api.POST('/api/me/stars', { body: { key } })
      : await api.DELETE('/api/me/stars/{key}', { params: { path: { key } } })
  )

const failure = ({ key, starred }: Toggle) =>
  `${key} was not ${starred ? 'starred' : 'unstarred'}`

const ISSUES_KEY = myIssuesQuery('recommended').queryKey.slice(0, 2)

/** D37: every home list flips the star at once; a failure puts it back. */
const useStarIssue = () =>
  useOptimisticWrite<InfiniteData<{ items: HomeIssue[] }>, Toggle>({
    queryKey: ISSUES_KEY,
    write: writeStar,
    change: (view, { key, starred }) => ({
      ...view,
      pages: view.pages.map((page) => ({
        ...page,
        items: page.items.map((issue) =>
          issue.key === key ? { ...issue, starred } : issue
        ),
      })),
    }),
    failure,
  })

export const useStarProject = () =>
  useOptimisticWrite<MyProject[], Toggle>({
    queryKey: myProjectsQuery.queryKey,
    write: writeStar,
    change: (projects, { key, starred }) =>
      projects.map((project) =>
        project.key === key
          ? {
              ...project,
              starred,
              starred_at: starred ? new Date().toISOString() : null,
            }
          : project
      ),
    failure,
  })

type StarToggleProps = {
  label: string
  starred: boolean
  onToggle: () => void
  className?: string
}

/** A 44px target on touch, 32px with a pointer; unstarred rests muted, starred stays filled. */
const StarToggle = ({
  label,
  starred,
  onToggle,
  className,
}: StarToggleProps) => (
  <button
    type='button'
    aria-label={label}
    aria-pressed={starred}
    title={starred ? 'Starred' : 'Star'}
    onClick={onToggle}
    className={cn(
      'relative z-10 grid size-11 shrink-0 place-items-center rounded-md text-subtle-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8',
      starred && 'text-warning',
      className
    )}
  >
    <Star className={cn('size-4', starred && 'fill-current')} aria-hidden />
  </button>
)

export const StarIssueButton = ({ issue }: { issue: HomeIssue }) => {
  const star = useStarIssue()
  return (
    <StarToggle
      label={`Star ${issue.key}`}
      starred={issue.starred}
      onToggle={() => star.mutate({ key: issue.key, starred: !issue.starred })}
    />
  )
}

export const StarProjectButton = ({
  project,
  className,
}: {
  project: MyProject
  className?: string
}) => {
  const star = useStarProject()
  return (
    <StarToggle
      label={`Star ${project.name}`}
      starred={project.starred}
      className={className}
      onToggle={() =>
        star.mutate({ key: project.key, starred: !project.starred })
      }
    />
  )
}

/** UI-60: the row keeps its place with the toggle flipped; the other lists change at once. */
export const StarItemButton = ({ item }: { item: MyItem }) => {
  const [starred, setStarred] = useState(true)
  const starIssue = useStarIssue()
  const starProject = useStarProject()
  const star = item.kind === 'issue' ? starIssue : starProject
  return (
    <StarToggle
      label={`Star ${item.kind === 'issue' ? item.key : item.name}`}
      starred={starred}
      onToggle={() => {
        setStarred(!starred)
        star.mutate(
          { key: item.key, starred: !starred },
          { onError: () => setStarred(starred) }
        )
      }}
    />
  )
}
