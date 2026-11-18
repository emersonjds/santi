import { Suspense, lazy, useRef, useState } from 'react'
import { Button } from '@/shared/ui/button'

// Lazy: the confirmation and its Radix dialog load on the first press (D39).
const PurgeProjectDialog = lazy(() =>
  import('./lifecycle-dialogs').then((module) => ({
    default: module.PurgeProjectDialog,
  }))
)

type PurgeProps = { projectKey: string; projectName: string }

export const PurgeProjectButton = ({ projectKey, projectName }: PurgeProps) => {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <>
      <Button
        ref={trigger}
        variant='ghost'
        className='h-11 text-destructive md:h-9'
        aria-label={`Delete ${projectName} forever`}
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Delete forever
      </Button>
      {open && (
        <Suspense fallback={null}>
          <PurgeProjectDialog
            projectKey={projectKey}
            projectName={projectName}
            open
            onOpenChange={setOpen}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              trigger.current?.focus()
            }}
          />
        </Suspense>
      )}
    </>
  )
}
