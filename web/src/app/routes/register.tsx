import { createFileRoute } from '@tanstack/react-router'
import { RegisterPage } from '@/pages/register/register-page'
import { redirectSignedIn } from '@/entities/session/require-session'

export const Route = createFileRoute('/register')({
  beforeLoad: ({ context }) => redirectSignedIn(context.queryClient),
  component: RegisterPage,
})
