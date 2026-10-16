import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { projectsQuery } from '@/entities/project/project-queries'
import { Button } from '@/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

const SIZE = 'h-11 md:h-9'
const LABEL = <span className='max-sm:sr-only'>Create</span>

// ponytail: the create-issue dialog lands with SAN-41; until then + Create only starts a first project.
export const CreateButton = () => {
  const { data: projects } = useQuery(projectsQuery)

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
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className='rounded-md'>
          <Button disabled className={SIZE}>
            <Plus />
            {LABEL}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Creating issues comes with the board.</TooltipContent>
    </Tooltip>
  )
}
