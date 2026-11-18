import { Suspense, lazy, useState } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/button'
import { messages } from './messages'

// Lazy: the confirmation and its Radix dialog load on the first press (D39).
const DeleteAccountDialog = lazy(() =>
  import('./delete-account-dialog').then((module) => ({
    default: module.DeleteAccountDialog,
  }))
)

export const DeleteAccountButton = () => {
  const t = useT(messages)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant='destructive'
        className='h-11 md:h-9'
        onClick={() => setOpen(true)}
      >
        {t('deleteMyAccount')}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <DeleteAccountDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
