import { Suspense, lazy, useEffect, useState } from 'react'
import { type NavigateOptions, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { Button } from '@/shared/ui/button'

// cmdk loads on the first open, outside the first-visit bundle (D39).
const CommandPalette = lazy(() =>
  import('./command-palette').then((module) => ({
    default: module.CommandPalette,
  }))
)

export const CommandMenu = ({ showTrigger }: { showTrigger: boolean }) => {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const navigate = useNavigate()

  const toggleTo = (next: boolean) => {
    setOpen(next)
    setOpened(true)
  }

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen((wasOpen) => !wasOpen)
      setOpened(true)
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
          onClick={() => toggleTo(true)}
          className='h-9 w-56 justify-start text-muted-foreground max-md:hidden'
        >
          <Search />
          Jump to a project
          <kbd className='ms-auto text-xs'>⌘K</kbd>
        </Button>
      )}
      {opened && (
        <Suspense fallback={null}>
          <CommandPalette open={open} setOpen={setOpen} go={go} />
        </Suspense>
      )}
    </>
  )
}
