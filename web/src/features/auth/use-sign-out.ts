import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { forgetSession } from '@/entities/session/require-session'
import { api } from '@/shared/api/client'
import { applyTheme } from '@/shared/lib/theme'
import { toast } from '@/shared/lib/toast'

export const useSignOut = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return async () => {
    const signedOut = await api
      .POST('/api/auth/logout')
      .then(({ response }) => response.ok)
      .catch(() => false)
    if (!signedOut) return toast.error("Couldn't sign out. Try again.")
    forgetSession(queryClient)
    applyTheme('system')
    await navigate({ to: '/login' })
  }
}
