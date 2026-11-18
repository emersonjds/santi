import { Suspense, lazy, useRef, useState } from 'react'
import { Button } from '@/shared/ui/button'
import type { RevokeInviteProps } from './revoke-invite-dialog'

const loadDialog = () => import('./revoke-invite-dialog')

// Lazy: the confirmation and its Radix dialog load on hover, focus or the first press (D39).
const RevokeInviteDialog = lazy(() =>
  loadDialog().then((module) => ({ default: module.RevokeInviteDialog }))
)

type RevokeInviteButtonProps = RevokeInviteProps & {
  /** The id of the row's summary, so each Revoke says which link it ends. */
  describedBy: string
}

export const RevokeInviteButton = ({
  describedBy,
  ...props
}: RevokeInviteButtonProps) => {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const preload = () => void loadDialog().catch(() => undefined)

  return (
    <>
      <Button
        ref={opener}
        variant='outline'
        className='h-11 md:h-9'
        aria-describedby={describedBy}
        aria-haspopup='dialog'
        aria-expanded={open}
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          setMounted(true)
          setOpen(true)
        }}
      >
        Revoke
      </Button>
      {mounted && (
        <Suspense fallback={null}>
          <RevokeInviteDialog
            {...props}
            open={open}
            opener={opener}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
