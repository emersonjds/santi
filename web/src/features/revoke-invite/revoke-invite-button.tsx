import { Suspense, lazy, useRef, useState } from 'react'
import { Button } from '@/shared/ui/button'
import type { RevokeInviteProps } from './revoke-invite-dialog'

// Lazy: the confirmation and its Radix dialog load on the first press (D39).
const RevokeInviteDialog = lazy(() =>
  import('./revoke-invite-dialog').then((module) => ({
    default: module.RevokeInviteDialog,
  }))
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
  const opener = useRef<HTMLButtonElement>(null)

  return (
    <>
      <Button
        ref={opener}
        variant='outline'
        className='h-11 md:h-9'
        aria-describedby={describedBy}
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Revoke
      </Button>
      {open && (
        <Suspense fallback={null}>
          <RevokeInviteDialog
            {...props}
            opener={opener}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
