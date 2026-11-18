import { Suspense, lazy, useState } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/button'
import { messages } from './messages'
import type { Token } from './revoke-token-dialog'

// Lazy: the confirmation and its Radix dialog load on the first press (D39).
const RevokeTokenDialog = lazy(() =>
  import('./revoke-token-dialog').then((module) => ({
    default: module.RevokeTokenDialog,
  }))
)

export const RevokeTokenButton = ({ token }: { token: Token }) => {
  const t = useT(messages)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant='outline'
        className='h-11 md:h-9'
        aria-label={t('revokeName', { name: token.name })}
        onClick={() => setOpen(true)}
      >
        {t('revoke')}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <RevokeTokenDialog token={token} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
