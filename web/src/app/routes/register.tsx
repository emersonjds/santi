import { createFileRoute } from '@tanstack/react-router'
import { RegisterPage } from '@/pages/register/register-page'
import {
  parseRedirect,
  redirectSignedIn,
} from '@/entities/session/require-session'

export const Route = createFileRoute('/register')({
  validateSearch: parseRedirect,
  beforeLoad: ({ context, search }) =>
    redirectSignedIn(context.queryClient, search.redirect),
  component: RegisterPage,
})
