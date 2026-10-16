import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { api } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'

export const SignOutButton = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const signOut = async () => {
    await api.POST('/api/auth/logout')
    queryClient.clear()
    await navigate({ to: '/login' })
  }

  return (
    <Button variant='ghost' className='h-11' onClick={signOut}>
      <LogOut />
      Sign out
    </Button>
  )
}
