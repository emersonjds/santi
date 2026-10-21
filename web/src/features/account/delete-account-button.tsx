import { Suspense, lazy, useState } from 'react'
import { Button } from '@/shared/ui/button'

// Lazy: the confirmation and its Radix dialog load on the first press (D39).
const DeleteAccountDialog = lazy(() =>
  import('./delete-account-dialog').then((module) => ({
    default: module.DeleteAccountDialog,
  }))
)

export const DeleteAccountButton = () => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant='destructive'
        className='h-11 md:h-9'
        onClick={() => setOpen(true)}
      >
        Delete my account
      </Button>
      {open && (
        <Suspense fallback={null}>
          <DeleteAccountDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
