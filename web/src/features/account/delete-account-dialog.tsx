import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { forgetSession } from '@/entities/session/require-session'
import { api, fieldMessage, okOrThrow } from '@/shared/api/client'
import { useT } from '@/shared/i18n/i18n'
import { toast } from '@/shared/lib/toast'
import { useReturnFocus } from '@/shared/lib/use-return-focus'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { PasswordInput } from '@/shared/ui/password-input'
import { messages } from './messages'

/** D45: asks for the password, then deletes the account and signs out everywhere (lazy chunk). */
export const DeleteAccountDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useT(messages)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const returnFocus = useReturnFocus()
  const [password, setPassword] = useState('')
  const remove = useMutation({
    mutationFn: async () =>
      okOrThrow(await api.DELETE('/api/me', { body: { password } })),
    onSuccess: async () => {
      forgetSession(queryClient)
      toast.success(t('deleted'))
      await navigate({ to: '/login' })
    },
  })

  return (
    <AlertDialog open onOpenChange={(open) => open || onClose()}>
      <AlertDialogContent onCloseAutoFocus={returnFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className='grid gap-2'>
              <p>{t('deleteFinal')}</p>
              <ul className='grid list-disc gap-1 ps-5'>
                <li>{t('deleteProjects')}</li>
                <li>{t('deleteAdmins')}</li>
                <li>{t('deleteKept')}</li>
              </ul>
              <p>{t('deleteExportFirst')}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          id='delete-account'
          className='grid gap-1.5'
          onSubmit={(event) => {
            event.preventDefault()
            remove.mutate()
          }}
        >
          <Label htmlFor='delete-account-password'>{t('password')}</Label>
          <PasswordInput
            id='delete-account-password'
            autoComplete='current-password'
            className='text-base md:text-sm'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={remove.isError}
            aria-describedby='delete-account-error'
          />
          <p
            id='delete-account-error'
            className='text-sm text-destructive'
            role={remove.isError ? 'alert' : undefined}
          >
            {remove.error && fieldMessage(remove.error)}
          </p>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11 md:h-9'>
            {t('cancel')}
          </AlertDialogCancel>
          <Button
            type='submit'
            form='delete-account'
            variant='destructive'
            className='h-11 md:h-9'
            disabled={remove.isPending || password === ''}
          >
            {t('deleteAccount')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
