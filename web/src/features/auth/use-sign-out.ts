import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { forgetSession } from '@/entities/session/require-session'
import { api } from '@/shared/api/client'

export const useSignOut = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return async () => {
    await api.POST('/api/auth/logout')
    forgetSession(queryClient)
    await navigate({ to: '/login' })
  }
}
