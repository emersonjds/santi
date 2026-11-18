import { Suspense, lazy, useRef, useState } from 'react'
import { Button } from '@/shared/ui/button'

const loadDialogs = () => import('./lifecycle-dialogs')

// Lazy: the confirmation and its Radix dialog load on hover, focus or the first press (D39).
const PurgeProjectDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.PurgeProjectDialog }))
)

type PurgeProps = { projectKey: string; projectName: string }

export const PurgeProjectButton = ({ projectKey, projectName }: PurgeProps) => {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const preload = () => void loadDialogs().catch(() => undefined)

  return (
    <>
      <Button
        ref={trigger}
        variant='ghost'
        className='h-11 text-destructive md:h-9'
        aria-label={`Delete ${projectName} forever`}
        aria-haspopup='dialog'
        aria-expanded={open}
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          setMounted(true)
          setOpen(true)
        }}
      >
        Delete forever
      </Button>
      {mounted && (
        <Suspense fallback={null}>
          <PurgeProjectDialog
            projectKey={projectKey}
            projectName={projectName}
            open={open}
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
