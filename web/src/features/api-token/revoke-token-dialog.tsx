import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tokensQuery } from '@/entities/user/api-tokens'
import { api, okOrThrow } from '@/shared/api/client'
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
import { RootError } from '@/shared/ui/root-error'

export type Token = { id: number; name: string }

/** D23: revoking deletes the token; the CLI or MCP using it gets 401 from then on (lazy chunk). */
export const RevokeTokenDialog = ({
  token,
  onClose,
}: {
  token: Token
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const returnFocus = useReturnFocus()
  const revoke = useMutation({
    mutationFn: async () =>
      okOrThrow(
        await api.DELETE('/api/tokens/{id}', {
          params: { path: { id: token.id } },
        })
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey })
      onClose()
    },
  })

  return (
    <AlertDialog open onOpenChange={(open) => open || onClose()}>
      <AlertDialogContent onCloseAutoFocus={returnFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {token.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything using this token will stop working right away.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RootError message={revoke.error?.message} />
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11 md:h-9'>Cancel</AlertDialogCancel>
          <Button
            variant='destructive'
            className='h-11 md:h-9'
            disabled={revoke.isPending}
            onClick={() => revoke.mutate()}
          >
            Revoke token
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
