import { useState } from 'react'
import { Star } from 'lucide-react'
import type { HomeIssue, MyItem, MyProject } from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'
import { useStarIssue, useStarProject } from './use-star'

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
      starred && 'text-star',
      className
    )}
  >
    <Star className={cn('size-4', starred && 'fill-star')} aria-hidden />
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
  onToggle,
}: {
  project: MyProject
  className?: string
  onToggle?: () => void
}) => {
  const star = useStarProject()
  return (
    <StarToggle
      label={`Star ${project.name}`}
      starred={project.starred}
      className={className}
      onToggle={() => {
        onToggle?.()
        star.mutate({ key: project.key, starred: !project.starred })
      }}
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
