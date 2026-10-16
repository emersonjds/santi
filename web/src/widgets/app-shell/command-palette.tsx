import { useQuery } from '@tanstack/react-query'
import type { NavigateOptions } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import { projectsQuery } from '@/entities/project/project-queries'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/shared/ui/command'

type CommandPaletteProps = {
  open: boolean
  setOpen: (open: boolean) => void
  go: (options: NavigateOptions) => void
}

export const CommandPalette = ({ open, setOpen, go }: CommandPaletteProps) => {
  const { data: projects = [] } = useQuery(projectsQuery)

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title='Jump to'
      description='Open a project or start a new one.'
    >
      <CommandInput placeholder='Jump to a project…' />
      <CommandList>
        <CommandEmpty>No project matches.</CommandEmpty>
        <CommandGroup heading='Projects'>
          {projects.map((project) => (
            <CommandItem
              key={project.key}
              value={`${project.name} ${project.key}`}
              onSelect={() =>
                go({ to: '/p/$key', params: { key: project.key } })
              }
            >
              <ProjectAvatar name={project.name} />
              {project.name}
              <CommandShortcut>{project.key}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading='Actions'>
          <CommandItem onSelect={() => go({ to: '/projects/new' })}>
            <Plus />
            New project
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
