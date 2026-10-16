import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type NavigateOptions, useNavigate } from '@tanstack/react-router'
import { Plus, Search } from 'lucide-react'
import { ProjectAvatar } from '@/entities/project/project-avatar'
import { projectsQuery } from '@/entities/project/project-queries'
import { Button } from '@/shared/ui/button'
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

export const CommandMenu = ({ showTrigger }: { showTrigger: boolean }) => {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data: projects = [] } = useQuery(projectsQuery)

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen((wasOpen) => !wasOpen)
    }
    document.addEventListener('keydown', toggle)
    return () => document.removeEventListener('keydown', toggle)
  }, [])

  const go = (options: NavigateOptions) => {
    setOpen(false)
    void navigate(options)
  }

  return (
    <>
      {showTrigger && (
        <Button
          variant='outline'
          onClick={() => setOpen(true)}
          className='h-9 w-56 justify-start text-muted-foreground max-md:hidden'
        >
          <Search />
          Jump to a project
          <kbd className='ms-auto text-xs'>⌘K</kbd>
        </Button>
      )}
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
    </>
  )
}
